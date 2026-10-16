import { useEffect, useState, useRef } from 'react';
import { api, apiCache } from '../api';
import { useLoading } from '../context/LoadingContext';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAppMode } from '../context/AppModeContext';
import {
  addDaysToDateKey, formatDateKey, formatDateTimeKey,
  formatTimeKey, normalizeTimeZone,
} from '../utils/datetime';
import Icon from '../components/ui/AegisIcon';

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SCHEDULE_DAYS_BACK = 7;
const SCHEDULE_DAYS_AHEAD = 3;
const SCHEDULE_LIMIT = 5000;

function buildQuery(path, params) {
  const q = new URLSearchParams(params).toString();
  return q ? `${path}?${q}` : path;
}

const css = `
  /* ── Schedule page ── */

  /* email table */
  .sch-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sch-table thead th {
    background: var(--do-surf2);
    padding: 8px 12px;
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .5px;
    text-transform: uppercase;
    color: var(--do-text4);
    border-bottom: 1px solid var(--do-border);
    white-space: nowrap;
  }
  .sch-table tbody td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--do-border);
    color: var(--do-text2);
    vertical-align: middle;
  }
  .sch-table tbody tr:last-child td { border-bottom: none; }
  .sch-table tbody tr:hover td { background: var(--do-surf2); cursor: pointer; }
  .sch-table tbody tr.expanded td { background: var(--do-surf2); }
  .sch-mono { font-family: var(--do-font-mono); font-size: 12px; color: var(--do-text); }
  .sch-email { font-family: var(--do-font-mono); font-size: 12px; color: var(--do-text2); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sch-subj { color: var(--do-text); font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sch-camp { color: var(--do-text3); font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* section header */
  .sch-section-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px;
    background: var(--do-surf2);
    border-bottom: 1px solid var(--do-border);
    cursor: pointer;
    user-select: none;
  }
  .sch-section-hdr:hover { background: var(--do-surf3); }
  .sch-section-title { font-size: 12px; font-weight: 700; color: var(--do-text3); text-transform: uppercase; letter-spacing: .5px; display: flex; align-items: center; gap: 6px; }
  .sch-section-count { font-family: var(--do-font-mono); font-size: 11px; color: var(--do-text4); }
  .sch-arrow { font-size: 10px; color: var(--do-text4); transition: transform .15s; display: inline-block; }
  .sch-arrow.open { transform: rotate(90deg); }

  /* date group */
  .sch-date-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    background: var(--do-bg);
    border-bottom: 1px solid var(--do-border);
  }
  .sch-date-label { font-size: 11px; font-weight: 700; color: var(--do-text3); font-family: var(--do-font-mono); }
  .sch-date-tz { font-size: 10px; color: var(--do-text4); }
  .sch-date-tag { font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: var(--do-r-full); }
  .sch-date-tag.today { background: var(--do-green-light); color: var(--do-green-dark); }
  .sch-date-tag.tomorrow { background: var(--do-blue-light); color: var(--do-blue-dark); }

  /* status badges */
  .sch-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase;
    padding: 2px 8px; border-radius: var(--do-r-full);
  }
  .sch-badge.sent { background: var(--do-green-light); color: var(--do-green-dark); }
  .sch-badge.scheduled { background: var(--do-blue-light); color: var(--do-blue-dark); }

  /* detail panel */
  .sch-detail {
    background: var(--do-surf2);
    border-bottom: 1px solid var(--do-border);
    padding: 14px 16px;
  }
  .sch-detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px 16px;
  }
  .sch-detail-grid .full { grid-column: 1 / -1; }
  .sch-dl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--do-text4); margin: 0 0 2px; }
  .sch-dv { font-size: 13px; color: var(--do-text); margin: 0; }
  .sch-dv.mono { font-family: var(--do-font-mono); font-size: 12px; }
  .sch-body-preview {
    font-size: 12px; color: var(--do-text2); line-height: 1.6;
    max-height: 120px; overflow: hidden;
    font-family: var(--do-font-mono);
    background: var(--do-surf3); border-radius: var(--do-r-sm);
    padding: 8px 10px; margin-top: 6px;
  }

  /* status bar */
  .sch-status-bar {
    display: flex; flex-wrap: wrap; gap: 8px 24px;
    align-items: center; padding: 10px 16px;
  }
  .sch-status-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }
  .sch-status-item { display: flex; align-items: center; gap: 6px; }
  .sch-status-label { font-size: 12px; font-weight: 500; color: var(--do-text2); }
  .sch-status-val { font-size: 12px; color: var(--do-text3); }
  .sch-status-val strong { color: var(--do-text); font-weight: 600; }
`;

function escapeHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function EmailPreviewModal({ item, onClose }) {
  const isHtml = item.sequence_is_html || (item.sequence_body || '').trim().startsWith('<');
  const backdropDown = useRef(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
      onMouseDown={e => { backdropDown.current = e.target === e.currentTarget; }}
      onClick={() => { if (backdropDown.current) onClose(); }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--do-surface)', borderRadius: 'var(--do-r-lg)', width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--do-shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--do-border)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--do-text)' }}>Email Preview</div>
            <div style={{ fontSize: 11, color: 'var(--do-text4)', marginTop: 2 }}>
              {item.type === 'sent' ? `Sent to ${item.lead_email}` : `Scheduled for ${item.lead_email}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--do-text4)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--do-border)', background: 'var(--do-surf2)', display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 12 }}>
          <span style={{ color: 'var(--do-text3)' }}><strong style={{ color: 'var(--do-text)' }}>Campaign:</strong> {item.campaign_name}</span>
          <span style={{ color: 'var(--do-text3)' }}><strong style={{ color: 'var(--do-text)' }}>Sequence:</strong> #{(item.sequence_index ?? 0) + 1}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ background: 'var(--do-surf2)', borderRadius: 'var(--do-r-sm)', padding: '8px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--do-text4)', marginBottom: 3 }}>Subject</div>
            <div style={{ fontWeight: 600, color: 'var(--do-text)', fontSize: 13 }}>{item.subject || <em style={{ color: 'var(--do-text4)', fontWeight: 400 }}>Reply in thread</em>}</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--do-text4)', marginBottom: 8 }}>Body</div>
          {item.sequence_body ? (
            isHtml
              ? <div style={{ border: '1px solid var(--do-border)', borderRadius: 'var(--do-r-sm)', padding: 16, background: 'var(--white)' }} dangerouslySetInnerHTML={{ __html: item.sequence_body }} />
              : <pre style={{ border: '1px solid var(--do-border)', borderRadius: 'var(--do-r-sm)', padding: 16, background: 'var(--do-surf2)', fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--do-font-mono)', color: 'var(--do-text2)' }}>{item.sequence_body}</pre>
          ) : <p style={{ color: 'var(--do-text4)', fontStyle: 'italic', fontSize: 12 }}>No body available</p>}
        </div>
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--do-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="do-btn-outline" style={{ fontSize: 12, padding: '5px 14px' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Schedule() {
  const notify = useNotify();
  const { isProduction } = useAppMode();

  const [sent, setSent] = useState(() => apiCache.get('/schedule/sent') || []);
  const [scheduled, setScheduled] = useState(() => apiCache.get('/schedule/scheduled') || []);
  const [stats, setStats] = useState(() => apiCache.get('/schedule/stats') || {});
  const [serverStatus, setServerStatus] = useState(() => apiCache.get('/status') || {});
  const [strategy, setStrategy] = useState('priority');
  const [timeToNext, setTimeToNext] = useState('');

  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [pastExpanded, setPastExpanded] = useState(false);
  const [scheduledExpanded, setScheduledExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);

  const [daysBack, setDaysBack] = useState(SCHEDULE_DAYS_BACK);
  const [daysAhead, setDaysAhead] = useState(SCHEDULE_DAYS_AHEAD);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const sentinelRef = useRef(null);
  const isLoadingMoreRef = useRef(false);

  const [recalcState, setRecalcState] = useState({ busy: false, text: 'Recalculate All' });
  const [validateState, setValidateState] = useState({ busy: false, text: 'Validate Queue' });
  const filterCampaignOptions = useRef([]);

  const ensureDetail = async (item) => {
    try {
      if (item.type === 'scheduled') {
        if (item.sequence_body) return item;
        const data = await api.get(`/schedule/scheduled/${item.slot_id}`);
        const merged = { ...item, ...data };
        setScheduled(prev => prev.map(s => s.slot_id === item.slot_id ? merged : s));
        return merged;
      }
      if (item.type === 'sent') {
        if (item.sequence_body || (item.opens && item.clicks)) return item;
        const data = await api.get(`/schedule/sent/${item.log_id}`);
        const merged = { ...item, ...data };
        setSent(prev => prev.map(s => s.log_id === item.log_id ? merged : s));
        return merged;
      }
    } catch { notify({ type: 'error', message: 'Failed to load email details' }); }
    return item;
  };

  const loadData = async (opts = {}) => {
    try {
      const eb = opts.daysBack ?? daysBack;
      const ea = opts.daysAhead ?? daysAhead;
      const [s, sch, st, srv, stratData] = await Promise.all([
        api.get(buildQuery('/schedule/sent', { days_back: eb, limit: SCHEDULE_LIMIT, offset: 0, include_body: true, include_events: false })).catch(() => []),
        api.get(buildQuery('/schedule/scheduled', { days_ahead: ea, limit: SCHEDULE_LIMIT, offset: 0, include_body: true })).catch(() => []),
        api.get('/schedule/stats').catch(() => ({})),
        api.get('/status').catch(() => ({})),
        api.get('/settings/scheduling-strategy').catch(() => ({})),
      ]);
      setSent(s); setScheduled(sch); setStats(st); setServerStatus(srv);
      setStrategy(stratData.scheduling_strategy || 'priority');
      setTimeToNext('');
      if (sch && sch.length) {
        const now = srv.server_time ? new Date(srv.server_time) : new Date();
        const future = sch.map(i => new Date(i.scheduled_at)).filter(d => d > now).sort((a,b) => a-b)[0];
        if (future) { const diff = future - now; const mins = Math.floor(diff / 60000); const hrs = Math.floor(mins / 60); setTimeToNext(`${hrs}h ${mins % 60}m`); }
        else setTimeToNext('none');
      }
      const camps = new Map();
      [...s, ...sch].forEach(e => { if (e.campaign_id && e.campaign_name) camps.set(e.campaign_id, e.campaign_name); });
      filterCampaignOptions.current = [...camps.entries()].sort((a,b) => a[1].localeCompare(b[1]));
    } catch { notify({ type: 'error', message: 'Failed to load schedule data' }); }
  };

  useEffect(() => { loadData().then(() => setInitialLoaded(true)); const id = setInterval(loadData, 30000); return () => clearInterval(id); }, [daysBack, daysAhead]);

  useEffect(() => {
    if (!initialLoaded) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || isLoadingMoreRef.current) return;
      isLoadingMoreRef.current = true; setIsLoadingMore(true);
      const nextAhead = daysAhead + SCHEDULE_DAYS_AHEAD;
      setDaysAhead(nextAhead);
      await loadData({ daysAhead: nextAhead });
      setIsLoadingMore(false); isLoadingMoreRef.current = false;
    }, { threshold: 0.1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [daysAhead, initialLoaded]);

  const clearFilters = () => { setCampaignFilter(''); setStatusFilter(''); setSearchFilter(''); };

  const matchesFilter = item => {
    if (campaignFilter && String(item.campaign_id) !== campaignFilter) return false;
    if (statusFilter && item.type !== statusFilter) return false;
    if (searchFilter) {
      const hay = [item.lead_email, item.lead_name, item.subject, item.campaign_name, item.inbox_email].join(' ').toLowerCase();
      if (!hay.includes(searchFilter.toLowerCase())) return false;
    }
    return true;
  };

  const filteredSent = sent.filter(matchesFilter);
  const filteredScheduled = scheduled.filter(matchesFilter);

  const fmtTime = (iso, tz) => { if (!iso) return ''; return formatTimeKey(iso, normalizeTimeZone(tz), !isProduction); };
  const fmtDateTime = (iso, tz) => { if (!iso) return '—'; return formatDateTimeKey(iso, normalizeTimeZone(tz), !isProduction); };
  const renderLastRun = iso => {
    if (!iso) return '—';
    const diff = Math.floor((new Date() - new Date(iso)) / 60000);
    return diff < 1 ? 'Just now' : diff + 'm ago';
  };

  const recalculateAll = async () => {
    setRecalcState({ busy: true, text: 'Recalculating…' });
    const baselineStats = await api.get('/schedule/stats').catch(() => ({}));
    try {
      const res = await fetch('/api/schedule/recalculate-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const stratLabel = strategy === 'priority' ? 'Priority' : 'Round-Robin';
        if (data.accepted) {
          setRecalcState({ busy: true, text: 'Running…' });
          const baselineToken = baselineStats?.global_recalc_finished_at ?? null;
          const deadline = Date.now() + 120000;
          for (let i = 0; Date.now() < deadline; i++) {
            await new Promise(r => setTimeout(r, i < 30 ? 350 : 1000));
            await loadData();
            const st = await api.get('/schedule/stats').catch(() => ({}));
            if (st.global_recalc_finished_at != null && st.global_recalc_finished_at !== baselineToken) break;
          }
          await loadData();
          const finalStats = await api.get('/schedule/stats').catch(() => ({}));
          setRecalcState({ busy: true, text: `Done! [${stratLabel}]` });
        } else {
          setRecalcState({ busy: true, text: `Done! [${strategy === 'priority' ? 'Priority' : 'Round-Robin'}]` });
          setTimeout(loadData, 100);
        }
      } else {
        notify({ type: 'error', message: 'Error recalculating: ' + await res.text() });
        setRecalcState({ busy: false, text: 'Recalculate All' });
      }
    } catch (err) {
      notify({ type: 'error', message: 'Error: ' + err.message });
      setRecalcState({ busy: false, text: 'Recalculate All' });
    } finally {
      setTimeout(() => setRecalcState({ busy: false, text: 'Recalculate All' }), 2000);
    }
  };

  const validateQueue = async () => {
    setValidateState({ busy: true, text: 'Validating…' });
    try {
      const res = await fetch('/api/schedule/validate-queue', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const issues = data.issues || [];
        setValidateState({ busy: true, text: `${data.total_slots_checked} slots, ${issues.length} issue(s)` });
        if (issues.length) { notify({ type: 'error', message: `${issues.length} issue(s) found. Check console.` }); console.log('Validation result:', data); }
        loadData();
      } else {
        notify({ type: 'error', message: 'Validation failed: ' + await res.text() });
        setValidateState({ busy: false, text: 'Validate Queue' });
      }
    } catch (err) {
      notify({ type: 'error', message: 'Error: ' + err.message });
      setValidateState({ busy: false, text: 'Validate Queue' });
    } finally {
      setTimeout(() => setValidateState({ busy: false, text: 'Validate Queue' }), 2000);
    }
  };

  const groupByDate = (items, reverse = false) => {
    const by = {};
    items.forEach(i => {
      const tz = normalizeTimeZone(i.campaign_timezone);
      const dateSource = reverse ? i.sent_at : i.scheduled_at;
      const dateKey = formatDateKey(dateSource || (reverse ? i.sent_date : i.scheduled_date), tz);
      const groupKey = `${tz}|${dateKey}`;
      if (!by[groupKey]) by[groupKey] = { tz, dateKey, items: [] };
      by[groupKey].items.push(i);
    });
    const ordered = Object.values(by).sort((a,b) => a.dateKey === b.dateKey ? a.tz.localeCompare(b.tz) : a.dateKey.localeCompare(b.dateKey));
    if (reverse) ordered.reverse();
    return ordered;
  };

  const renderDetailPanel = (item, tz) => {
    const isSent = item.type === 'sent';
    return (
      <tr>
        <td colSpan={6} style={{ padding: 0 }}>
          <div className="sch-detail">
            <div className="sch-detail-grid">
              <div>
                <p className="sch-dl">Status</p>
                <span className={`sch-badge ${isSent ? 'sent' : 'scheduled'}`}>{isSent ? 'Sent' : 'Scheduled'}</span>
              </div>
              {isSent
                ? <div><p className="sch-dl">Sent at</p><p className="sch-dv mono">{fmtDateTime(item.sent_at, tz)}</p></div>
                : <div><p className="sch-dl">Scheduled for</p><p className="sch-dv mono">{fmtDateTime(item.scheduled_at, tz)}</p></div>
              }
              <div>
                <p className="sch-dl">Lead</p>
                <p className="sch-dv mono" style={{ fontSize: 11 }}>{item.lead_email}</p>
                {item.lead_name && <p className="sch-dv" style={{ fontSize: 12, color: 'var(--do-text3)' }}>{item.lead_name}</p>}
                {item.lead_status && <span className={`do-pill do-pill-${item.lead_status === 'active' ? 'green' : 'gray'}`} style={{ marginTop: 3, display: 'inline-flex' }}>{item.lead_status}</span>}
              </div>
              <div>
                <p className="sch-dl">Campaign</p>
                <p className="sch-dv"><a href={`/campaigns/${item.campaign_id}`} style={{ color: 'var(--do-gold-dark)' }}>{item.campaign_name}</a></p>
              </div>
              <div><p className="sch-dl">Sequence step</p><p className="sch-dv">{(item.sequence_index ?? 0) + 1}</p></div>
              <div><p className="sch-dl">Wait after previous</p><p className="sch-dv">{item.sequence_wait_days ?? 0} day(s)</p></div>
              {!isSent && item.inbox_email && (
                <div><p className="sch-dl">Inbox</p><p className="sch-dv mono" style={{ fontSize: 11 }}>{item.inbox_email}</p></div>
              )}
              {!isSent && item.inbox_max_per_day && (
                <div><p className="sch-dl">Inbox max/day</p><p className="sch-dv">{item.inbox_max_per_day}</p></div>
              )}
              {!isSent && item.position_in_day && (
                <div><p className="sch-dl">Position in day</p><p className="sch-dv">#{item.position_in_day}</p></div>
              )}
              <div><p className="sch-dl">Sending window</p><p className="sch-dv">{item.campaign_hours_start} – {item.campaign_hours_end}</p></div>
              <div><p className="sch-dl">Stop on reply</p><p className="sch-dv">{item.campaign_stop_on_reply ? 'Yes' : 'No'}</p></div>
              {item.sequence_body && (
                <div className="full">
                  <p className="sch-dl" style={{ marginBottom: 6 }}>Email body</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <button className="do-btn-outline" style={{ fontSize: 11, padding: '4px 12px' }}
                      onClick={async () => { const full = await ensureDetail(item); setPreviewItem(full); }}>
                      View full preview
                    </button>
                  </div>
                  <div className="sch-body-preview" dangerouslySetInnerHTML={{ __html: item.sequence_body.trim().startsWith('<') ? item.sequence_body : escapeHtml(item.sequence_body) }} />
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  };

  const renderTable = (items, isSent, todayByTz, tomorrowByTz) => {
    const rows = [];
    groupByDate(items, isSent).forEach(group => {
      const todayKey = todayByTz?.get(group.tz) || formatDateKey(new Date(), group.tz);
      const tomorrowKey = tomorrowByTz?.get(group.tz) || '';
      rows.push(
        <tr key={`date-${group.tz}-${group.dateKey}`}>
          <td colSpan={6} style={{ padding: 0 }}>
            <div className="sch-date-row">
              <span className="sch-date-label">{group.dateKey}</span>
              <span className="sch-date-tz">{group.tz}</span>
              {group.dateKey === todayKey && <span className="sch-date-tag today">today</span>}
              {group.dateKey === tomorrowKey && <span className="sch-date-tag tomorrow">tomorrow</span>}
            </div>
          </td>
        </tr>
      );
      const sortedItems = isSent ? group.items : [...group.items].sort((a,b) => (a.scheduled_at||'').localeCompare(b.scheduled_at||''));
      sortedItems.forEach(item => {
        const uid = isSent ? `sent-${item.log_id}` : `sched-${item.slot_id}`;
        const tz = normalizeTimeZone(item.campaign_timezone);
        const time = isSent ? fmtTime(item.sent_at, tz) : fmtTime(item.scheduled_at, tz);
        const isExpanded = expandedId === uid;
        rows.push(
          <tr key={uid} className={isExpanded ? 'expanded' : ''}
            onClick={async () => { if (isExpanded) { setExpandedId(null); return; } setExpandedId(uid); await ensureDetail(item); }}>
            <td><span className="sch-mono">{time}</span></td>
            <td><span className={`sch-badge ${isSent ? 'sent' : 'scheduled'}`}>{isSent ? 'Sent' : 'Scheduled'}</span></td>
            <td><span className="sch-email" title={item.lead_email}>{item.lead_email}</span></td>
            <td><span className="sch-subj" title={item.subject || '(no subject)'}>{item.subject || <em style={{ color: 'var(--do-text4)', fontStyle: 'italic' }}>no subject</em>}</span></td>
            <td><span className="sch-camp" title={item.campaign_name}>{item.campaign_name}</span></td>
            <td><span className="sch-email" title={item.inbox_email || '—'}>{item.inbox_email || '—'}</span></td>
          </tr>
        );
        if (isExpanded) rows.push(renderDetailPanel(item, tz));
      });
    });
    return rows;
  };

  const todayByTz = new Map();
  const tomorrowByTz = new Map();
  filteredScheduled.forEach(i => {
    const tz = normalizeTimeZone(i.campaign_timezone);
    if (!todayByTz.has(tz)) {
      const todayKey = formatDateKey(new Date(), tz);
      todayByTz.set(tz, todayKey);
      const add = addDaysToDateKey;
      tomorrowByTz.set(tz, add(todayKey, 1));
    }
  });

  return (
    <>
      <style>{css}</style>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ background: 'var(--do-bg)', padding: '20px' }}>

        {/* Hero */}
        <div className="do-hero">
          <div className="do-hero-eyebrow">Sending · Queue</div>
          <div className="do-hero-title">Schedule</div>
          <div className="do-hero-sub">Sent history and upcoming sends — times shown in each campaign's configured timezone.</div>
          <div className="do-hero-actions">
            <button className="do-btn-hero" onClick={loadData}>↻ Refresh</button>
            {!isProduction && (
              <>
                <button className="do-btn-hero-outline" onClick={validateQueue} disabled={validateState.busy} style={{ opacity: validateState.busy ? 0.7 : 1 }}><Icon name="search" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{validateState.text}</button>
                <button className="do-btn-hero-outline" onClick={recalculateAll} disabled={recalcState.busy} style={{ opacity: recalcState.busy ? 0.7 : 1 }}><Icon name="zap" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{recalcState.text}</button>
              </>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="do-card" style={{ marginBottom: 16 }}>
          <div className="sch-status-bar">
            <div className="sch-status-item">
              <span className="sch-status-dot" style={{ background: serverStatus.schedule_running ? 'var(--do-green)' : 'var(--do-red)' }} />
              <span className="sch-status-label">Schedule {serverStatus.schedule_running ? 'running' : 'stopped'}</span>
            </div>
            <span className="sch-status-val">Last job: <strong>{renderLastRun(serverStatus.last_send_job_run)}</strong></span>
            <span className="sch-status-val">Last sent: <strong>{serverStatus.last_send_job_sent_count ?? 0}</strong></span>
            <span className="sch-status-val">Strategy: <strong
              style={{ color: 'var(--do-gold-dark)', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
              onClick={() => { window.location = '/settings#general'; }}>
              {strategy === 'priority' ? 'Priority' : 'Round-Robin'}
            </strong></span>
            {!isProduction && serverStatus.test_mode !== undefined && (
              <span className="sch-status-val">Test mode: <strong style={{ color: serverStatus.test_mode ? 'var(--do-red)' : 'var(--do-green)' }}>{serverStatus.test_mode ? 'ON' : 'OFF'}</strong></span>
            )}
            {!isProduction && timeToNext && (
              <span className="sch-status-val">Next in: <strong>{timeToNext}</strong></span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--do-text4)' }}>Auto-refresh: 30s</span>
          </div>
        </div>

        {/* Stat chips */}
        <div className="do-stat-row" style={{ marginBottom: 16 }}>
          <div className="do-stat-chip">
            <div className="do-stat-icon" style={{ background: 'var(--do-icon-green)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--do-green-dark)" strokeWidth="2">
                <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
              </svg>
            </div>
            <div>
              <div className="do-stat-val">{(stats.total_sent || 0).toLocaleString()}</div>
              <div className="do-stat-label">Total sent</div>
            </div>
          </div>
          <div className="do-stat-chip">
            <div className="do-stat-icon" style={{ background: 'var(--do-icon-blue)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--do-blue-dark)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <div className="do-stat-val">{(stats.total_scheduled || 0).toLocaleString()}</div>
              <div className="do-stat-label">Scheduled</div>
            </div>
          </div>
          <div className="do-stat-chip">
            <div className="do-stat-icon" style={{ background: 'var(--do-icon-gold)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--do-gold-dark)" strokeWidth="2">
                <path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </div>
            <div>
              <div className="do-stat-val">{stats.total_campaigns || 0}</div>
              <div className="do-stat-label">Campaigns</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)}
            style={{ background: 'var(--do-surface)', border: '1px solid var(--do-border-dark)', borderRadius: 'var(--do-r-sm)', color: 'var(--do-text2)', fontSize: 12, padding: '6px 10px' }}>
            <option value="">All campaigns</option>
            {filterCampaignOptions.current.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ background: 'var(--do-surface)', border: '1px solid var(--do-border-dark)', borderRadius: 'var(--do-r-sm)', color: 'var(--do-text2)', fontSize: 12, padding: '6px 10px' }}>
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <input type="text" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} placeholder="Search lead, subject…"
            style={{ background: 'var(--do-surface)', border: '1px solid var(--do-border-dark)', borderRadius: 'var(--do-r-sm)', color: 'var(--do-text)', fontSize: 12, padding: '6px 10px', maxWidth: 240, outline: 'none' }} />
          <button className="do-btn-outline" onClick={clearFilters} style={{ fontSize: 12, padding: '5px 14px' }}>Clear</button>
        </div>

        {/* Email table */}
        <div className="do-card" style={{ overflow: 'hidden' }}>

          {/* Sent section */}
          {filteredSent.length > 0 && (
            <>
              <div className="sch-section-hdr" onClick={() => setPastExpanded(v => !v)}>
                <div className="sch-section-title">
                  <span className={`sch-arrow${pastExpanded ? ' open' : ''}`}>▶</span>
                  Sent
                </div>
                <span className="sch-section-count">{(stats.total_sent ?? filteredSent.length).toLocaleString()} emails</span>
              </div>
              {pastExpanded && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sch-table">
                    <thead>
                      <tr>
                        <th>Time</th><th>Status</th><th>Lead</th><th>Subject</th><th>Campaign</th><th>Inbox</th>
                      </tr>
                    </thead>
                    <tbody>{renderTable(filteredSent, true, null, null)}</tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Scheduled section */}
          {filteredScheduled.length > 0 && (
            <>
              <div className="sch-section-hdr" onClick={() => setScheduledExpanded(v => !v)}
                style={{ borderTop: filteredSent.length > 0 ? '1px solid var(--do-border)' : 'none' }}>
                <div className="sch-section-title">
                  <span className={`sch-arrow${scheduledExpanded ? ' open' : ''}`}>▶</span>
                  Scheduled
                </div>
                <span className="sch-section-count">{(stats.total_scheduled ?? filteredScheduled.length).toLocaleString()} emails</span>
              </div>
              {scheduledExpanded && (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sch-table">
                    <thead>
                      <tr>
                        <th>Time</th><th>Status</th><th>Lead</th><th>Subject</th><th>Campaign</th><th>Inbox</th>
                      </tr>
                    </thead>
                    <tbody>{renderTable(filteredScheduled, false, todayByTz, tomorrowByTz)}</tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {filteredSent.length === 0 && filteredScheduled.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--do-text3)', fontSize: 13 }}>
              No emails match your filters.
            </div>
          )}

          <div ref={sentinelRef} style={{ height: 1 }} />
          {isLoadingMore && <p style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: 'var(--do-text4)' }}>Loading more…</p>}
        </div>

        {previewItem && <EmailPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />}
      </div>
    </>
  );
}