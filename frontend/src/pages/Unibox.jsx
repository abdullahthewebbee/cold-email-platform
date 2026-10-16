import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmailContent from '../components/EmailContent';
import { Button } from '../components/ui/Button';
import { useNotify } from '../context/NotificationContext';
import { useUniboxNotifications } from '../context/UniboxNotificationsContext';
import { buildHtmlReply, escapeHtml, formatAttributionDate } from '../utils/emailQuote';
import Icon from '../components/ui/AegisIcon';

const PAGE_SIZE = 25;
const OLDER_WINDOW_DAYS = 7;

async function uniboxRequest(path, options = {}) {
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    throw err;
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Unexpected response type from Unibox API.');
  }
  return res.json();
}

function formatDateTime(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const now = new Date();
  const isToday = dt.toDateString() === now.toDateString();
  if (isToday) return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor((now - dt) / 86400000);
  if (diffDays < 7) return dt.toLocaleDateString([], { weekday: 'short' });
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateTimeFull(value) {
  if (!value) return 'Unknown';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function extractEmailAddress(headerValue) {
  if (!headerValue) return '';
  const angleMatch = headerValue.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim().toLowerCase();
  const emailMatch = headerValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0]?.trim().toLowerCase() || '';
}

function makeReplySubject(subject) {
  const clean = (subject || '').trim();
  if (!clean) return '';
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

function extractFromName(headerValue) {
  if (!headerValue) return '';
  const angleMatch = headerValue.match(/^"?([^"<]*?)"?\s*<[^>]+>/);
  if (angleMatch?.[1]?.trim()) return angleMatch[1].trim();
  return headerValue.split('@')[0] || headerValue;
}

function buildOriginalEmailFromMsg(msg) {
  if (!msg) return null;
  return {
    fromName: extractFromName(msg.from || ''),
    fromAddress: extractEmailAddress(msg.from || ''),
    date: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    plainBody: msg.body_plain || msg.snippet || '',
    htmlBody: msg.body_html || `<div dir="ltr">${escapeHtml(msg.body_plain || msg.snippet || '')}</div>`,
  };
}

const STATUS_PILL = {
  active:        'do-pill do-pill-blue',
  contacted:     'do-pill do-pill-blue',
  completed:     'do-pill do-pill-green',
  replied:       'do-pill do-pill-green',
  unsubscribed:  'do-pill do-pill-gray',
  bounced:       'do-pill do-pill-red',
  interested:    'do-pill do-pill-green',
  not_interested:'do-pill do-pill-orange',
  out_of_office: 'do-pill do-pill-blue',
  wrong_person:  'do-pill do-pill-gray',
  auto_reply:    'do-pill do-pill-gray',
};

const LEAD_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'completed', label: 'Completed' },
  { value: 'replied', label: 'Replied' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'out_of_office', label: 'Out of Office' },
  { value: 'wrong_person', label: 'Wrong Person' },
  { value: 'auto_reply', label: 'Auto Reply' },
];

// ── Thread panel ──────────────────────────────────────────────────────────────
function ThreadPanel({ thread, onClose, onSent, notify }) {
  const [compose, setCompose] = useState({ body: '', includeQuote: false, originalEmail: null });
  const [replyOpen, setReplyOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftingAI, setDraftingAI] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const messages = thread?.messages || [];
    const lastReceived = [...messages].reverse().find(m => m.direction === 'received');
    const fallback = messages[messages.length - 1];
    const originalEmail = buildOriginalEmailFromMsg(lastReceived || fallback || null);
    setCompose({ body: '', includeQuote: Boolean(originalEmail), originalEmail });
    setReplyOpen(false);
  }, [thread?.thread_id]);

  useEffect(() => {
    if (replyOpen && scrollRef.current) {
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  }, [replyOpen]);

  const generateAiDraft = async () => {
    if (!thread) return;
    setDraftingAI(true);
    try {
      const params = new URLSearchParams({ inbox_id: String(thread.inbox_id) });
      const data = await uniboxRequest(`/unibox/threads/${thread.thread_id}/draft-reply?${params.toString()}`, { method: 'POST' });
      setCompose(c => ({ ...c, body: data.draft }));
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Could not generate AI draft.' });
    } finally {
      setDraftingAI(false);
    }
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!thread) return;
    const toEmail = extractEmailAddress(
      [...(thread.messages || [])].reverse().find(m => m.direction === 'received')?.from || ''
    );
    if (!toEmail) { notify({ type: 'error', message: 'Could not determine reply address.' }); return; }

    let finalBody, finalIsHtml;
    if (compose.includeQuote && compose.originalEmail) {
      const replyHtml = `<div dir="ltr">${escapeHtml(compose.body).replace(/\n/g, '<br>')}</div>`;
      finalBody = buildHtmlReply(replyHtml, compose.originalEmail.htmlBody, compose.originalEmail);
      finalIsHtml = true;
    } else {
      finalBody = compose.body;
      finalIsHtml = false;
    }

    setSending(true);
    try {
      await uniboxRequest('/unibox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inbox_id: thread.inbox_id,
          to_email: toEmail,
          subject: makeReplySubject(thread.subject || ''),
          body: finalBody,
          thread_id: thread.thread_id,
          is_html: finalIsHtml,
        }),
      });
      notify({ type: 'success', message: 'Reply sent.' });
      setCompose(c => ({ ...c, body: '' }));
      setReplyOpen(false);
      onSent?.();
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Failed to send reply.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--do-border)', background: 'var(--do-surf2)' }}>
      {/* Thread header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--do-surface)',
        borderBottom: '1px solid var(--do-border)',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--do-text)' }}>
            {thread.subject || '(no subject)'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--do-text4)', marginTop: 2 }}>
            {thread.inbox_account || thread.gmail_account} · {formatDateTimeFull(thread.last_message_timestamp)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--do-text3)', padding: 6, borderRadius: 6 }}
          title="Collapse"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="18,15 12,9 6,15"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ maxHeight: 520, overflowY: 'auto' }}>
        {(thread.messages || []).map((msg) => (
          <div key={msg.message_id} style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--do-border)',
            background: msg.direction === 'sent' ? 'var(--do-surf2)' : 'var(--do-surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: msg.direction === 'sent' ? 'var(--do-gold-dark)' : 'var(--do-surf4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: msg.direction === 'sent' ? 'var(--on-gold)' : 'var(--do-text3)',
                  flexShrink: 0,
                }}>
                  {msg.direction === 'sent' ? 'Me' : (extractFromName(msg.from || '') || 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--do-text)' }}>
                    {msg.direction === 'sent' ? 'You' : (extractFromName(msg.from || '') || msg.from || 'Client')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--do-text4)' }}>{msg.from || ''}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--do-text4)' }}>{formatDateTimeFull(msg.timestamp)}</div>
            </div>
            {msg.body_html && msg.body_html.trim() ? (
              <div style={{
                border: '1px solid var(--do-border)',
                borderRadius: 'var(--do-r-sm)',
                background: 'var(--do-surface)',
                overflow: 'auto',
                maxHeight: 300,
              }}>
                <EmailContent html={msg.body_html} stripTracking />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--do-text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-words' }}>
                {msg.body_plain || msg.snippet || '(no body)'}
              </div>
            )}
          </div>
        ))}

        {/* Reply form */}
        {replyOpen && (
          <div style={{ padding: '12px 16px', background: 'var(--do-surface)', borderTop: '1px solid var(--do-border)' }}>
            <form onSubmit={sendReply}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>Reply</span>
                <button
                  type="button"
                  onClick={generateAiDraft}
                  disabled={draftingAI}
                  style={{
                    fontSize: 11, padding: '2px 10px',
                    borderRadius: 'var(--do-r-full)',
                    background: 'var(--do-gold-bg)',
                    color: 'var(--do-gold-dark)',
                    border: '1px solid var(--do-gold)',
                    cursor: 'pointer',
                    opacity: draftingAI ? 0.5 : 1,
                  }}
                >
                  {draftingAI ? 'Drafting…' : <><Icon name="sparkles" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />AI draft</>}
                </button>
              </div>
              <textarea
                value={compose.body}
                onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                style={{
                  width: '100%', minHeight: 120, resize: 'vertical',
                  background: 'var(--do-surf2)',
                  border: '1px solid var(--do-border-dark)',
                  borderRadius: 'var(--do-r-sm)',
                  color: 'var(--do-text)',
                  fontSize: 13, padding: '8px 10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                placeholder="Write your reply…"
                required
                autoFocus
              />
              {compose.originalEmail && (
                <div style={{ marginTop: 6 }}>
                  {compose.includeQuote ? (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => setCompose(c => ({ ...c, includeQuote: false }))}
                        style={{ fontSize: 10, padding: '2px 6px', background: 'var(--do-surf3)', border: '1px solid var(--do-border-dark)', borderRadius: 4, color: 'var(--do-text3)', cursor: 'pointer', marginTop: 2 }}
                      ><Icon name="x" size={14} /></button>
                      <blockquote style={{ borderLeft: '2px solid var(--do-border-dark)', paddingLeft: 8, fontSize: 11, color: 'var(--do-text4)', maxHeight: 48, overflow: 'hidden', margin: 0 }}>
                        {compose.originalEmail.plainBody?.slice(0, 200) || ''}
                        {(compose.originalEmail.plainBody?.length || 0) > 200 && '…'}
                      </blockquote>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setCompose(c => ({ ...c, includeQuote: true }))} style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--do-text4)', cursor: 'pointer' }}>
                      + Include quoted message
                    </button>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  className="do-btn-outline"
                  style={{ fontSize: 12, padding: '5px 14px' }}
                >Cancel</button>
                <button
                  type="submit"
                  className="do-btn-gold"
                  disabled={sending}
                  style={{ fontSize: 12, padding: '5px 14px', opacity: sending ? 0.7 : 1 }}
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Footer */}
      {!replyOpen && (
        <div style={{ padding: '8px 16px', background: 'var(--do-surface)', borderTop: '1px solid var(--do-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="do-btn-gold" onClick={() => setReplyOpen(true)} style={{ fontSize: 12, padding: '6px 16px' }}>
            Reply
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Unibox page ──────────────────────────────────────────────────────────
export default function Unibox() {
  const notify = useNotify();
  const { refresh: refreshNotifications, count: unreadCount } = useUniboxNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const [leadsOnly, setLeadsOnly] = useState(true);
  const [leadStatusFilter, setLeadStatusFilter] = useState('');
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [initialListSyncLoading, setInitialListSyncLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);

  const [expandedKey, setExpandedKey] = useState(null);
  const [expandedThread, setExpandedThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const listScrollRef = useRef(null);
  const listRequestInFlightRef = useRef(false);
  const sseRefreshTimerRef = useRef(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const loadConversations = useCallback(
    async ({ page: requestedPage = 1, silent = false, append = false } = {}) => {
      if (listRequestInFlightRef.current) return;
      listRequestInFlightRef.current = true;
      if (!silent) { setListLoading(true); setListError(''); }
      try {
        const data = await uniboxRequest(
          `/unibox?page=${requestedPage}&page_size=${PAGE_SIZE}&leads_only=${leadsOnly}${leadStatusFilter ? `&lead_status=${encodeURIComponent(leadStatusFilter)}` : ''}`,
        );
        const items = data?.items || [];
        setTotal(data?.total || 0);
        if (append) setConversations(prev => [...prev, ...items]);
        else setConversations(items);
        setPage(requestedPage);
      } catch (err) {
        if (!silent) setListError(err.message || 'Failed to load conversations');
      } finally {
        if (!silent) setListLoading(false);
        listRequestInFlightRef.current = false;
      }
    },
    [leadsOnly, leadStatusFilter],
  );

  const loadSyncStatus = useCallback(async ({ silent = false } = {}) => {
    try {
      const status = await uniboxRequest('/unibox/status');
      setInitialListSyncLoading(Boolean(status?.initial_list_sync_in_progress));
    } catch {}
  }, []);

  const loadThread = useCallback(async (threadId, inboxId) => {
    const key = `${threadId}::${inboxId}`;
    setExpandedKey(key);
    setThreadLoading(true);
    try {
      const params = new URLSearchParams();
      if (inboxId) params.set('inbox_id', String(inboxId));
      const data = await uniboxRequest(`/unibox/threads/${encodeURIComponent(threadId)}?${params.toString()}`);
      setExpandedThread(data);
      setSearchParams({ thread: threadId, ...(inboxId ? { inbox: String(inboxId) } : {}) });
      if (inboxId) {
        try {
          await uniboxRequest(`/unibox/threads/${encodeURIComponent(threadId)}/mark-read?inbox_id=${inboxId}`, { method: 'POST' });
          setConversations(prev =>
            prev.map(c => c.thread_id === threadId && c.inbox_id === Number(inboxId) ? { ...c, unread_lead_reply: false } : c)
          );
          refreshNotifications();
        } catch {}
      }
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Failed to load thread' });
      setExpandedKey(null);
      setExpandedThread(null);
    } finally {
      setThreadLoading(false);
    }
  }, [setSearchParams, refreshNotifications, notify]);

  const collapseThread = useCallback(() => {
    setExpandedKey(null);
    setExpandedThread(null);
    setSearchParams({});
  }, [setSearchParams]);

  const triggerSync = useCallback(async () => {
    try {
      const res = await uniboxRequest('/unibox/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if ((res?.queued || 0) > 0) await loadSyncStatus({ silent: true });
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Failed to start sync.' });
    }
  }, [loadSyncStatus, notify]);

  const triggerLoadOlder = useCallback(async () => {
    setLoadingOlder(true);
    try {
      const res = await uniboxRequest('/unibox/load-more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window_days: OLDER_WINDOW_DAYS }),
      });
      if ((res?.queued || 0) <= 0) notify({ type: 'error', message: 'No inboxes available for backfill.' });
      else notify({ type: 'success', message: `Loading older mail (${OLDER_WINDOW_DAYS} days) for all inboxes.` });
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Failed to load older mail.' });
    } finally {
      setLoadingOlder(false);
    }
  }, [notify]);

  const deleteThread = useCallback(async (threadId, inboxId, e) => {
    e.preventDefault(); e.stopPropagation();
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await uniboxRequest(`/unibox/threads/${encodeURIComponent(threadId)}?inbox_id=${inboxId}`, { method: 'DELETE' });
      setConversations(prev => prev.filter(c => !(c.thread_id === threadId && c.inbox_id === inboxId)));
      const key = `${threadId}::${inboxId}`;
      if (expandedKey === key) { setExpandedKey(null); setExpandedThread(null); setSearchParams({}); }
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Failed to delete thread' });
    }
  }, [notify, expandedKey, setSearchParams]);

  useEffect(() => { loadConversations({ page: 1 }); loadSyncStatus({ silent: true }); }, [loadConversations, loadSyncStatus]);

  useEffect(() => {
    const thread = searchParams.get('thread');
    const inbox = searchParams.get('inbox');
    if (thread && !expandedKey) loadThread(thread, inbox || undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (listLoading || page >= totalPages) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) loadConversations({ page: page + 1, append: true });
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [listLoading, page, totalPages, loadConversations]);

  useEffect(() => {
    if (!listLoading && !listError && conversations.length === 0 && !autoSyncAttempted) {
      setAutoSyncAttempted(true);
      triggerSync();
    }
  }, [autoSyncAttempted, conversations.length, listError, listLoading, triggerSync]);

  useEffect(() => {
    if (!initialListSyncLoading) return;
    const timer = setInterval(() => { loadConversations({ page: 1, silent: true }); loadSyncStatus({ silent: true }); }, 2000);
    return () => clearInterval(timer);
  }, [initialListSyncLoading, loadConversations, loadSyncStatus]);

  useEffect(() => {
    const source = new EventSource('/api/unibox/events');
    const onUpdate = () => {
      if (sseRefreshTimerRef.current) return;
      sseRefreshTimerRef.current = setTimeout(() => {
        sseRefreshTimerRef.current = null;
        loadConversations({ silent: true });
        if (expandedThread) loadThread(expandedThread.thread_id, expandedThread.inbox_id);
      }, 1000);
    };
    source.addEventListener('unibox.thread.updated', onUpdate);
    source.addEventListener('unibox.notification', () => loadConversations({ silent: true }));
    return () => { source.close(); if (sseRefreshTimerRef.current) clearTimeout(sseRefreshTimerRef.current); };
  }, [loadConversations, loadThread, expandedThread]);

  const handleRowClick = useCallback((item) => {
    const key = `${item.thread_id}::${item.inbox_id}`;
    if (expandedKey === key) collapseThread();
    else loadThread(item.thread_id, item.inbox_id);
  }, [expandedKey, collapseThread, loadThread]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden', padding: 24, background: 'var(--do-bg)' }}>

      {/* ── Hero ── */}
      <div className="do-hero" style={{ marginBottom: 16 }}>
        <div className="do-hero-eyebrow">Replies · Conversations</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="do-hero-title" style={{ marginBottom: 0 }}>Inbox</div>
          {unreadCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 22, height: 22, padding: '0 5px',
              borderRadius: 'var(--do-r-full)',
              background: 'var(--accent)',
              color: 'var(--white)', fontSize: 11, fontWeight: 700,
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="do-hero-sub">Email inbox and replies — synced from all connected accounts.</div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--do-text3)', fontWeight: 500 }}>
            {total} conversation{total !== 1 ? 's' : ''}
          </span>
          <button
            onClick={async () => {
              if (!window.confirm('Delete all conversations? This cannot be undone.')) return;
              for (const c of conversations) {
                try { await uniboxRequest(`/unibox/threads/${encodeURIComponent(c.thread_id)}?inbox_id=${c.inbox_id}`, { method: 'DELETE' }); } catch {}
              }
              setConversations([]); setExpandedKey(null); setExpandedThread(null); setSearchParams({});
            }}
            style={{
              fontSize: 11, padding: '3px 10px',
              border: '1px solid var(--do-red)',
              borderRadius: 'var(--do-r-full)',
              color: 'var(--do-red)',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            Delete All
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setLeadsOnly(v => !v)}
            className="do-preset-pill"
            style={leadsOnly ? { background: 'var(--do-gold-dark)', borderColor: 'var(--do-gold-dark)', color: 'var(--on-gold)' } : {}}
          >
            {leadsOnly ? 'Leads only' : 'All mail'}
          </button>
          <select
            value={leadStatusFilter}
            onChange={e => setLeadStatusFilter(e.target.value)}
            style={{
              fontSize: 12, padding: '4px 10px',
              border: '1px solid var(--do-border-dark)',
              borderRadius: 'var(--do-r-full)',
              background: 'var(--do-surface)',
              color: 'var(--do-text2)',
              outline: 'none',
            }}
          >
            {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Status messages */}
      {listLoading && <p style={{ fontSize: 12, color: 'var(--do-text3)', marginBottom: 8 }}>Loading conversations…</p>}
      {initialListSyncLoading && <p style={{ fontSize: 12, color: 'var(--do-gold-dark)', marginBottom: 8 }}>Initial sync in progress…</p>}
      {listError && <p style={{ fontSize: 12, color: 'var(--do-red)', marginBottom: 8 }}>{listError}</p>}

      {/* ── Thread list ── */}
      <div
        ref={listScrollRef}
        className="do-card"
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 }}
      >
        {!listLoading && !listError && conversations.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--do-text4)', padding: '24px 16px' }}>
            {leadsOnly ? 'No lead conversations found. Replies from leads will appear here.' : 'No synced conversations yet.'}
          </p>
        )}

        {conversations.map((item) => {
          const key = `${item.thread_id}::${item.inbox_id}`;
          const isExpanded = expandedKey === key;
          const isUnread = Boolean(item.unread_lead_reply);

          return (
            <div key={key} style={{ borderBottom: '1px solid var(--do-border)' }}>
              {/* Row */}
              <div
                onClick={() => handleRowClick(item)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  cursor: 'pointer', userSelect: 'none',
                  background: isExpanded
                    ? 'var(--do-gold-bg)'
                    : isUnread
                      ? 'var(--do-blue-light)'
                      : 'var(--do-surface)',
                  transition: 'background .12s ease',
                }}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--do-surf2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isExpanded ? 'var(--do-gold-bg)' : isUnread ? 'var(--do-blue-light)' : 'var(--do-surface)'; }}
              >
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: isUnread ? 'var(--do-blue)' : 'var(--do-surf4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  color: isUnread ? 'var(--white)' : 'var(--do-text3)',
                }}>
                  {(item.lead_email || item.inbox_account || '?').charAt(0).toUpperCase()}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{
                    flexShrink: 0, width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontSize: 13,
                    fontWeight: isUnread ? 700 : 500,
                    color: 'var(--do-text)',
                    fontFamily: 'var(--do-font-mono)',
                  }}>
                    {item.lead_email || item.inbox_account || '—'}
                  </span>
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontSize: 13,
                    fontWeight: isUnread ? 600 : 400,
                    color: isUnread ? 'var(--do-text)' : 'var(--do-text2)',
                  }}>
                    {item.subject || '(no subject)'}
                    {item.last_message_snippet && (
                      <span style={{ color: 'var(--do-text4)', fontWeight: 400 }}> — {item.last_message_snippet}</span>
                    )}
                  </span>
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {item.lead_status && (
                    <span className={STATUS_PILL[item.lead_status] || 'do-pill do-pill-gray'}>
                      {item.lead_status.replace(/_/g, ' ')}
                    </span>
                  )}
                  {isUnread && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--do-blue)', flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 11, color: isUnread ? 'var(--do-text)' : 'var(--do-text4)', fontWeight: isUnread ? 600 : 400 }}>
                    {formatDateTime(item.timestamp)}
                  </span>
                  <button
                    onClick={(e) => deleteThread(item.thread_id, item.inbox_id, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--do-border-dark)', padding: 4, borderRadius: 4, opacity: 0 }}
                    className="unibox-del-btn"
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14H6L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4h6v2"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded thread */}
              {isExpanded && (
                threadLoading
                  ? <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--do-text4)', background: 'var(--do-surf2)', borderTop: '1px solid var(--do-border)' }}>Loading thread…</div>
                  : expandedThread && (
                    <ThreadPanel
                      thread={expandedThread}
                      onClose={collapseThread}
                      onSent={() => { loadConversations({ silent: true }); loadThread(expandedThread.thread_id, expandedThread.inbox_id); }}
                      notify={notify}
                    />
                  )
              )}
            </div>
          );
        })}

        {/* Load older */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
          <button
            onClick={triggerLoadOlder}
            disabled={loadingOlder}
            style={{
              background: 'none', border: 'none',
              fontSize: 12, color: 'var(--do-text4)',
              cursor: loadingOlder ? 'default' : 'pointer',
              opacity: loadingOlder ? 0.5 : 1,
            }}
          >
            {loadingOlder ? 'Loading…' : 'Show older'}
          </button>
        </div>
      </div>

      <style>{`
        .unibox-del-btn { opacity: 0 !important; transition: opacity .15s; }
        div:hover > .unibox-del-btn,
        [style*="cursor: pointer"]:hover .unibox-del-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}