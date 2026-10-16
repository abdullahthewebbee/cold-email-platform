import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useAppMode } from '../context/AppModeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useNotify } from '../context/NotificationContext';
import { useSystemHealth } from '../context/SystemHealthContext';
import { useSubscription } from '../hooks/useSubscription';
import Icon from '../components/ui/AegisIcon';

/* ─────────────────────────────── helpers ─────────────────────────────── */

function clampJitterSeconds(seconds, minS, maxS) {
  return Math.max(minS, Math.min(maxS, seconds));
}
function jitterInputMinutesFromSeconds(seconds) {
  return Math.round(seconds / 60);
}
function jitterSecondsFromInputMinutes(minutes) {
  return minutes * 60;
}
function formatJitterMinutesLabel(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* ─────────────────────────── CollapsibleInfo ─────────────────────────── */

function CollapsibleInfo({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: '1px solid var(--do-border)',
      borderRadius: 'var(--do-r-sm)',
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'var(--do-surf2)',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--do-text2)',
        }}
      >
        {title}
        <span style={{ fontSize: 16, opacity: 0.5, lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--do-text3)', lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── RedirectUriBlock ────────────────────────── */

function RedirectUriBlock({ uri }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(uri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <div style={{
      background: 'var(--do-surf2)',
      border: '1px solid var(--do-border)',
      borderRadius: 'var(--do-r-sm)',
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    }}>
      <code style={{
        flex: 1,
        fontFamily: 'var(--do-font-mono)',
        fontSize: 11,
        wordBreak: 'break-all',
        color: 'var(--do-text2)',
      }}>{uri}</code>
      <button
        onClick={copy}
        style={{
          flexShrink: 0,
          padding: '4px 10px',
          borderRadius: 'var(--do-r-full)',
          border: '1px solid var(--do-border-dark)',
          background: copied ? 'var(--do-green-light)' : 'var(--do-surface)',
          color: copied ? 'var(--do-green-dark)' : 'var(--do-text3)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all .15s',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/* ────────────────────────── InboxTrackingOptions ─────────────────────── */

function InboxTrackingOptions({ trackingConfig, onChange, appDomain }) {
  const { tracking_method, tracking_domain, use_app_domain } = trackingConfig;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Beacon */}
      <label style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        border: `1px solid ${tracking_method === 'beacon' ? 'var(--do-gold)' : 'var(--do-border)'}`,
        borderRadius: 'var(--do-r-sm)',
        cursor: 'pointer',
        background: tracking_method === 'beacon' ? 'var(--do-gold-bg)' : 'var(--do-surface)',
        transition: 'all .15s',
      }}>
        <input
          type="radio"
          name="tracking_method"
          value="beacon"
          checked={tracking_method === 'beacon'}
          onChange={() => onChange({ ...trackingConfig, tracking_method: 'beacon' })}
          style={{ marginTop: 2, accentColor: 'var(--do-gold-dark)' }}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>Beacon Tracking</div>
          <div style={{ fontSize: 12, color: 'var(--do-text3)', marginTop: 2 }}>
            Track opens via a pixel beacon hosted on the app server. Simple, no DNS setup needed.
          </div>
        </div>
      </label>

      {/* DNS CNAME */}
      <label style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        border: `1px solid ${tracking_method === 'cname' ? 'var(--do-gold)' : 'var(--do-border)'}`,
        borderRadius: 'var(--do-r-sm)',
        cursor: 'pointer',
        background: tracking_method === 'cname' ? 'var(--do-gold-bg)' : 'var(--do-surface)',
        transition: 'all .15s',
      }}>
        <input
          type="radio"
          name="tracking_method"
          value="cname"
          checked={tracking_method === 'cname'}
          onChange={() => onChange({ ...trackingConfig, tracking_method: 'cname' })}
          style={{ marginTop: 2, accentColor: 'var(--do-gold-dark)' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>DNS CNAME Tracking</div>
          <div style={{ fontSize: 12, color: 'var(--do-text3)', marginTop: 2 }}>
            Use a custom subdomain CNAME for tracking. Improves deliverability by matching sender domain.
          </div>
          {tracking_method === 'cname' && (
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--do-text4)', display: 'block', marginBottom: 4 }}>
                TRACKING SUBDOMAIN
              </label>
              <input
                type="text"
                value={tracking_domain || ''}
                onChange={e => onChange({ ...trackingConfig, tracking_domain: e.target.value })}
                placeholder="track.yourdomain.com"
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 'var(--do-r-sm)',
                  border: '1px solid var(--do-border-dark)',
                  background: 'var(--do-surf2)',
                  color: 'var(--do-text)',
                  fontSize: 12,
                  fontFamily: 'var(--do-font-mono)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--do-text4)', marginTop: 4 }}>
                Add a CNAME record pointing this subdomain to the app server.
              </div>
            </div>
          )}
        </div>
      </label>

      {/* Use app domain */}
      {appDomain && (
        <label style={{
          display: 'flex',
          gap: 10,
          padding: '8px 12px',
          border: '1px solid var(--do-border)',
          borderRadius: 'var(--do-r-sm)',
          cursor: 'pointer',
          alignItems: 'center',
        }}>
          <input
            type="checkbox"
            checked={!!use_app_domain}
            onChange={e => onChange({ ...trackingConfig, use_app_domain: e.target.checked })}
            style={{ accentColor: 'var(--do-gold-dark)' }}
          />
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>Use app domain </span>
            <code style={{ fontSize: 11, fontFamily: 'var(--do-font-mono)', color: 'var(--do-text3)' }}>({appDomain})</code>
            <div style={{ fontSize: 12, color: 'var(--do-text3)', marginTop: 1 }}>
              Route tracking through the shared app domain instead of your own.
            </div>
          </div>
        </label>
      )}
    </div>
  );
}

/* ═══════════════════════════════ Inboxes ════════════════════════════════ */

const PROVIDER_OPTIONS = [
  { id: 'gmail',     label: 'Gmail',      icon: 'mail' },
  { id: 'office365', label: 'Office 365', icon: 'mail' },
  { id: 'smtp',      label: 'SMTP / IMAP', icon: 'settings' },
];

const WARMUP_PRESETS = [5, 10, 20, 40];

const IA_CSS = `
.ia-page{display:flex;flex-direction:column;gap:16px;width:100%}
.ia-hero.do-hero{display:flex !important;align-items:center;justify-content:space-between;gap:24px;margin:0 !important;padding:26px 32px 26px 36px !important}
.ia-hero-text{min-width:0}
.ia-hero-actions{display:flex;gap:10px;flex:none;align-self:flex-start}
.ia-hero .do-btn-hero{display:inline-flex;align-items:center;gap:6px}
.ia-layout{display:flex;gap:16px;align-items:flex-start}
.ia-list{flex:0 0 400px;max-width:100%;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow-sm);overflow:hidden}
.ia-list-head{display:flex;align-items:center;gap:14px;padding:18px 22px 14px}
.ia-list-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--badge-bg-gold);color:var(--gold-dark);flex:none}
.ia-list-title{font-size:15px;font-weight:700;color:var(--text)}
.ia-list-sub{font-size:12px;color:var(--text-3);margin-top:1px}
.ia-row{display:flex;align-items:center;gap:14px;padding:14px 22px;cursor:pointer;border-top:1px solid var(--border);transition:background .15s}
.ia-row:hover{background:var(--badge-bg-gold)}
.ia-row.selected{background:var(--badge-bg-gold);box-shadow:inset 3px 0 0 var(--gold-dark)}
.ia-avatar{flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:var(--surface-3,#f1ece2);color:var(--gold-dark)}
.ia-row-main{flex:1;min-width:0}
.ia-row-name{font-size:13.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ia-row-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:2px;font-size:11.5px;color:var(--text-3)}
.ia-row-meta b{font-family:var(--font-mono,monospace);color:var(--text-2);font-weight:600}
.ia-warm{color:var(--gold-dark);font-weight:600;display:inline-flex;align-items:center;gap:3px}
.ia-list .do-pill{flex:none}
.ia-list > div:not(.ia-list-head):not(.ia-row){margin:0 22px 22px}
.ia-layout > .do-card{flex:1;min-width:0;margin:0 !important}
.ia-empty{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;min-height:200px;padding:48px;font-size:13px;color:var(--text-3);background:var(--surface);border:1px dashed var(--border-dark,var(--border));border-radius:20px}
@media(max-width:1000px){.ia-layout{flex-direction:column}.ia-list{flex:none;width:100%}.ia-hero.do-hero{flex-direction:column;align-items:flex-start}}
`;

export default function Inboxes() {
  const { mode } = useAppMode?.() ?? { mode: 'outreach' };
  const confirm = useConfirm?.() ?? (async () => true);
  const notify  = useNotify?.()  ?? { success: () => {}, error: () => {} };
  const { refresh: refreshHealth } = useSystemHealth?.() ?? {};
  const { subscription } = useSubscription?.() ?? {};

  /* ── list state ── */
  const [inboxes, setInboxes]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState(null);

  /* ── detail / edit state ── */
  const [detail, setDetail]           = useState(null);
  const [editName, setEditName]       = useState('');
  const [editDailyLimit, setEditDailyLimit] = useState(50);
  const [editMinDelay, setEditMinDelay]   = useState(60);
  const [editMaxDelay, setEditMaxDelay]   = useState(300);
  const [editSignature, setEditSignature] = useState('');
  const [editTracking, setEditTracking]   = useState({ tracking_method: 'beacon', tracking_domain: '', use_app_domain: false });
  const [editWarmup, setEditWarmup]       = useState(false);
  const [editWarmupLimit, setEditWarmupLimit] = useState(5);
  const [editWarmupRampDays, setEditWarmupRampDays] = useState(14);
  const [dirty, setDirty]             = useState(false);
  const [saving, setSaving]           = useState(false);

  /* ── add modal ── */
  const [showAdd, setShowAdd]         = useState(false);
  const [addStep, setAddStep]         = useState('provider'); // 'provider' | 'smtp' | 'oauth_wait'
  const [addProvider, setAddProvider] = useState(null);
  const [addSmtp, setAddSmtp]         = useState({ host: '', port: 587, user: '', pass: '', imap_host: '', imap_port: 993 });
  const [addName, setAddName]         = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const oauthPollRef = useRef({});

  /* ── pause modal ── */
  const [showPause, setShowPause]     = useState(false);
  const [pauseInbox, setPauseInbox]   = useState(null);
  const [pauseAction, setPauseAction] = useState('reassign'); // 'reassign' | 'pause'

  /* ── unsaved-changes warning ── */
  const [showUnsaved, setShowUnsaved]   = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState(null);

  /* ── fetch inboxes ── */
  const fetchInboxes = useCallback(async () => {
  try {
    const data = await api.get('/inboxes');
    const list = Array.isArray(data) ? data : (data?.inboxes ?? data?.items ?? data?.results ?? []);
    setInboxes(list);
    } catch (e) {
      notify.error('Failed to load inboxes');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { fetchInboxes(); }, [fetchInboxes]);

  /* ── select inbox → populate detail ── */
  const populateDetail = useCallback((inbox) => {
    setDetail(inbox);
    setEditName(inbox.name || inbox.email || '');
    setEditDailyLimit(inbox.daily_limit ?? 50);
    setEditMinDelay(inbox.min_delay_seconds ?? 60);
    setEditMaxDelay(inbox.max_delay_seconds ?? 300);
    setEditSignature(inbox.signature || '');
    setEditTracking({
      tracking_method: inbox.tracking_method || 'beacon',
      tracking_domain: inbox.tracking_domain || '',
      use_app_domain:  inbox.use_app_domain  || false,
    });
    setEditWarmup(inbox.warmup_enabled ?? false);
    setEditWarmupLimit(inbox.warmup_daily_limit ?? 5);
    setEditWarmupRampDays(inbox.warmup_ramp_days ?? 14);
    setDirty(false);
  }, []);

  const handleSelect = useCallback((inbox) => {
    if (dirty) {
      setPendingSelectId(inbox.id);
      setShowUnsaved(true);
      return;
    }
    setSelectedId(inbox.id);
    populateDetail(inbox);
  }, [dirty, populateDetail]);

  /* ── save detail ── */
  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const payload = {
        name:              editName,
        daily_limit:       editDailyLimit,
        min_delay_seconds: editMinDelay,
        max_delay_seconds: editMaxDelay,
        signature:         editSignature,
        tracking_method:   editTracking.tracking_method,
        tracking_domain:   editTracking.tracking_domain,
        use_app_domain:    editTracking.use_app_domain,
        warmup_enabled:    editWarmup,
        warmup_daily_limit: editWarmupLimit,
        warmup_ramp_days:  editWarmupRampDays,
      };
      const updated = await api.patch(`/inboxes/${detail.id}`, payload);
      setInboxes(prev => prev.map(i => i.id === detail.id ? { ...i, ...updated } : i));
      populateDetail({ ...detail, ...updated });
      notify.success('Inbox saved');
    } catch (e) {
      notify.error('Failed to save inbox');
    } finally {
      setSaving(false);
    }
  };

  /* ── delete inbox ── */
  const handleDelete = async (inbox) => {
    const ok = await confirm(`Remove ${inbox.name || inbox.email}? This cannot be undone.`);
    if (!ok) return;
    try {
      await api.delete(`/inboxes/${inbox.id}`);
      setInboxes(prev => prev.filter(i => i.id !== inbox.id));
      if (selectedId === inbox.id) { setSelectedId(null); setDetail(null); }
      notify.success('Inbox removed');
      refreshHealth?.();
    } catch (e) {
      notify.error('Failed to remove inbox');
    }
  };

  /* ── pause inbox ── */
  const handlePauseConfirm = async () => {
    if (!pauseInbox) return;
    try {
      const updated = await api.patch(`/inboxes/${pauseInbox.id}`, {
        paused: true,
        pause_action: pauseAction,
      });
      setInboxes(prev => prev.map(i => i.id === pauseInbox.id ? { ...i, ...updated } : i));
      if (detail?.id === pauseInbox.id) populateDetail({ ...detail, ...updated });
      notify.success('Inbox paused');
    } catch (e) {
      notify.error('Failed to pause inbox');
    } finally {
      setShowPause(false);
      setPauseInbox(null);
    }
  };

  const handleResume = async (inbox) => {
    try {
      const updated = await api.patch(`/inboxes/${inbox.id}`, { paused: false });
      setInboxes(prev => prev.map(i => i.id === inbox.id ? { ...i, ...updated } : i));
      if (detail?.id === inbox.id) populateDetail({ ...detail, ...updated });
      notify.success('Inbox resumed');
    } catch (e) {
      notify.error('Failed to resume inbox');
    }
  };

  /* ── OAuth connect ── */
  const handleOAuthConnect = async (provider) => {
    setConnectLoading(true);
    try {
      const { url } = await api.post('/inboxes/oauth/url', { provider, name: addName });
      const win = window.open(url, '_blank', 'width=600,height=700');
      setAddStep('oauth_wait');

      // Poll for completion
      oauthPollRef.current.interval = setInterval(async () => {
        try {
          const result = await api.get('/inboxes/oauth/status');
          if (result?.completed) {
            clearInterval(oauthPollRef.current.interval);
            await fetchInboxes();
            setShowAdd(false);
            setAddStep('provider');
            notify.success(`${provider === 'gmail' ? 'Gmail' : 'Office 365'} inbox connected`);
            refreshHealth?.();
          }
        } catch {}
      }, 2000);

      // Auto-clear after 5 min
      setTimeout(() => {
        clearInterval(oauthPollRef.current.interval);
        if (addStep === 'oauth_wait') setAddStep('provider');
      }, 300000);
    } catch (e) {
      notify.error('Failed to get OAuth URL');
    } finally {
      setConnectLoading(false);
    }
  };

  /* ── SMTP connect ── */
  const handleSmtpConnect = async () => {
    setConnectLoading(true);
    try {
      const payload = { ...addSmtp, name: addName, provider: 'smtp' };
      await api.post('/inboxes/smtp', payload);
      await fetchInboxes();
      setShowAdd(false);
      setAddStep('provider');
      notify.success('SMTP inbox connected');
      refreshHealth?.();
    } catch (e) {
      notify.error(e?.message || 'Failed to connect SMTP inbox');
    } finally {
      setConnectLoading(false);
    }
  };

  /* ── unsaved changes flow ── */
  const handleUnsavedDiscard = () => {
    setShowUnsaved(false);
    setDirty(false);
    const target = inboxes.find(i => i.id === pendingSelectId);
    if (target) { setSelectedId(target.id); populateDetail(target); }
    setPendingSelectId(null);
  };
  const handleUnsavedSaveFirst = async () => {
    setShowUnsaved(false);
    await handleSave();
    const target = inboxes.find(i => i.id === pendingSelectId);
    if (target) { setSelectedId(target.id); populateDetail(target); }
    setPendingSelectId(null);
  };

  /* ─────────────────── derived ─────────────────── */
  const activeCount = inboxes.filter(i => !i.paused).length;
  const totalDaily  = inboxes.reduce((s, i) => s + (i.daily_limit || 0), 0);

  /* ═══════════════════════════ render ════════════════════════════ */

  return (
    <div className="ia-page">
      <style>{IA_CSS}</style>

      {/* ── Hero ── */}
      <div className="do-hero ia-hero">
        <div className="ia-hero-text">
          <div className="do-hero-eyebrow">Email · Accounts</div>
          <div className="do-hero-title">Email Accounts</div>
          <div className="do-hero-sub">
            {loading ? 'Loading…' : `${activeCount} active inbox${activeCount !== 1 ? 'es' : ''} · up to ${totalDaily.toLocaleString()} emails/day`}
          </div>
        </div>
        <div className="ia-hero-actions">
          <button className="do-btn-hero" onClick={() => { setShowAdd(true); setAddStep('provider'); setAddProvider(null); setAddName(''); }}>
            <Icon name="plus" size={14} /> Connect Inbox
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="ia-layout">

        {/* ── Inbox list ── */}
        <div className="ia-list">
          <div className="ia-list-head">
            <span className="ia-list-ico"><Icon name="mail" size={18} /></span>
            <div>
              <div className="ia-list-title">Connected accounts</div>
              <div className="ia-list-sub">{inboxes.length} connected</div>
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--do-text4)' }}>Loading inboxes…</div>
          )}

          {!loading && inboxes.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              background: 'var(--do-surface)',
              border: '1px solid var(--do-border)',
              borderRadius: 'var(--do-r-lg)',
            }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Icon name="inbox" size={36} /></div>
              <div style={{ fontFamily: 'var(--do-font-serif)', fontSize: 17, fontWeight: 700, color: 'var(--do-text)', marginBottom: 6 }}>
                No inboxes yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--do-text3)', marginBottom: 20 }}>
                Connect your first Gmail, Office 365, or SMTP inbox to start sending.
              </div>
              <button className="do-btn-gold" onClick={() => { setShowAdd(true); setAddStep('provider'); setAddProvider(null); setAddName(''); }}>
                + Connect Inbox
              </button>
            </div>
          )}

          {inboxes.map(inbox => {
            const isSelected = selectedId === inbox.id;
            const statusPill = inbox.paused ? 'do-pill-orange' : 'do-pill-green';
            const statusLabel = inbox.paused ? 'Paused' : 'Active';
            const initials = (inbox.name || inbox.email || '?').trim().slice(0, 2).toUpperCase();

            return (
              <div
                key={inbox.id}
                onClick={() => handleSelect(inbox)}
                className={`ia-row${isSelected ? ' selected' : ''}`}
              >
                <span className="ia-avatar">{initials}</span>
                <div className="ia-row-main">
                  <div className="ia-row-name">{inbox.name || inbox.email}</div>
                  <div className="ia-row-meta">
                    {inbox.name && <span>{inbox.email}</span>}
                    <span><b>{inbox.daily_limit ?? 50}</b> /day</span>
                    <span style={{ textTransform: 'capitalize' }}>{inbox.provider || 'smtp'}</span>
                    {inbox.warmup_enabled && (
                      <span className="ia-warm"><Icon name="flame" size={12} /> warm-up</span>
                    )}
                  </div>
                </div>
                <span className={`do-pill ${statusPill}`}>{statusLabel}</span>
              </div>
            );
          })}
        </div>

        {/* ── Detail panel ── */}
        {detail && (
          <div className="do-card" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
            <div className="do-card-head">
              <div>
                <div className="do-card-title">{detail.name || detail.email}</div>
                {detail.name && <div style={{ fontSize: 12, color: 'var(--do-text4)', marginTop: 2 }}>{detail.email}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {detail.paused ? (
                  <button className="do-btn-gold" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => handleResume(detail)}>
                    ▶ Resume
                  </button>
                ) : (
                  <button className="do-btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setPauseInbox(detail); setShowPause(true); }}>
                    ⏸ Pause
                  </button>
                )}
                <button
                  className="do-btn-outline"
                  style={{ fontSize: 12, padding: '5px 12px', color: 'var(--do-red)', borderColor: 'var(--do-red)' }}
                  onClick={() => handleDelete(detail)}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="do-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Name */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Display Name
                </label>
                <input
                  value={editName}
                  onChange={e => { setEditName(e.target.value); setDirty(true); }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--do-r-sm)',
                    border: '1px solid var(--do-border-dark)',
                    background: 'var(--do-surf2)',
                    color: 'var(--do-text)',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Sending limits */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Sending Limits
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Daily Limit', value: editDailyLimit, set: setEditDailyLimit, min: 1, max: 500, step: 1 },
                    { label: 'Min Delay (s)', value: editMinDelay, set: setEditMinDelay, min: 10, max: 3600, step: 10 },
                    { label: 'Max Delay (s)', value: editMaxDelay, set: setEditMaxDelay, min: 10, max: 7200, step: 10 },
                  ].map(({ label, value, set, min, max, step }) => (
                    <div key={label}>
                      <label style={{ fontSize: 11, color: 'var(--do-text4)', display: 'block', marginBottom: 4 }}>{label}</label>
                      <input
                        type="number"
                        value={value}
                        min={min} max={max} step={step}
                        onChange={e => { set(Number(e.target.value)); setDirty(true); }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 'var(--do-r-sm)',
                          border: '1px solid var(--do-border-dark)',
                          background: 'var(--do-surf2)',
                          color: 'var(--do-text)',
                          fontSize: 13,
                          fontFamily: 'var(--do-font-mono)',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Signature */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Email Signature
                </label>
                <textarea
                  value={editSignature}
                  onChange={e => { setEditSignature(e.target.value); setDirty(true); }}
                  rows={4}
                  placeholder="Your signature (HTML or plain text)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--do-r-sm)',
                    border: '1px solid var(--do-border-dark)',
                    background: 'var(--do-surf2)',
                    color: 'var(--do-text)',
                    fontSize: 12,
                    fontFamily: 'var(--do-font-mono)',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Tracking */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Open Tracking
                </div>
                <InboxTrackingOptions
                  trackingConfig={editTracking}
                  onChange={cfg => { setEditTracking(cfg); setDirty(true); }}
                  appDomain={detail.app_domain}
                />
              </div>

              {/* Warm-up */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Inbox Warm-up
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                  <div
                    onClick={() => { setEditWarmup(p => !p); setDirty(true); }}
                    style={{
                      width: 36,
                      height: 20,
                      borderRadius: 10,
                      background: editWarmup ? 'var(--do-gold-dark)' : 'var(--do-border-dark)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background .2s',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      top: 2, left: editWarmup ? 18 : 2,
                      width: 16, height: 16,
                      borderRadius: '50%',
                      background: 'var(--bg-elevated)',
                      transition: 'left .2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,.25)',
                    }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>
                    {editWarmup ? 'Warm-up enabled' : 'Warm-up disabled'}
                  </span>
                </label>

                {editWarmup && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--do-text4)', display: 'block', marginBottom: 4 }}>Daily warm-up limit</label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {WARMUP_PRESETS.map(n => (
                          <button
                            key={n}
                            onClick={() => { setEditWarmupLimit(n); setDirty(true); }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 'var(--do-r-full)',
                              border: `1px solid ${editWarmupLimit === n ? 'var(--do-gold-dark)' : 'var(--do-border-dark)'}`,
                              background: editWarmupLimit === n ? 'var(--do-gold-dark)' : 'transparent',
                              color: editWarmupLimit === n ? 'var(--on-gold)' : 'var(--do-text3)',
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {n}
                          </button>
                        ))}
                        <input
                          type="number"
                          value={editWarmupLimit}
                          min={1} max={100}
                          onChange={e => { setEditWarmupLimit(Number(e.target.value)); setDirty(true); }}
                          style={{
                            width: 56,
                            padding: '4px 8px',
                            borderRadius: 'var(--do-r-sm)',
                            border: '1px solid var(--do-border-dark)',
                            background: 'var(--do-surf2)',
                            color: 'var(--do-text)',
                            fontSize: 12,
                            fontFamily: 'var(--do-font-mono)',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--do-text4)', display: 'block', marginBottom: 4 }}>Ramp-up days</label>
                      <input
                        type="number"
                        value={editWarmupRampDays}
                        min={1} max={90}
                        onChange={e => { setEditWarmupRampDays(Number(e.target.value)); setDirty(true); }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 'var(--do-r-sm)',
                          border: '1px solid var(--do-border-dark)',
                          background: 'var(--do-surf2)',
                          color: 'var(--do-text)',
                          fontSize: 13,
                          fontFamily: 'var(--do-font-mono)',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Save bar */}
              {dirty && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  paddingTop: 12,
                  borderTop: '1px solid var(--do-border)',
                }}>
                  <button className="do-btn-outline" onClick={() => { populateDetail(detail); }}>
                    Discard
                  </button>
                  <button className="do-btn-gold" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty right panel placeholder */}
        {!detail && !loading && inboxes.length > 0 && (
          <div className="ia-empty">
            ← Select an inbox to view details
          </div>
        )}
      </div>

      {/* ════════════════ Add Inbox Modal ════════════════ */}
      {showAdd && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--do-surface)',
            border: '1px solid var(--do-border)',
            borderRadius: 'var(--do-r-xl)',
            boxShadow: 'var(--do-shadow-lg)',
            width: '100%', maxWidth: 480,
            padding: 28,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div style={{ fontFamily: 'var(--do-font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--do-text)' }}>
                {addStep === 'provider'   ? 'Connect Inbox' :
                 addStep === 'smtp'       ? 'SMTP / IMAP Setup' :
                                           'Connecting…'}
              </div>
              <button
                onClick={() => { setShowAdd(false); clearInterval(oauthPollRef.current.interval); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--do-text4)', lineHeight: 1 }}
              ><Icon name="x" size={14} /></button>
            </div>

            {/* Provider selection */}
            {addStep === 'provider' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Account Name (optional)
                  </label>
                  <input
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    placeholder="e.g. Sales Outreach"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--do-r-sm)',
                      border: '1px solid var(--do-border-dark)',
                      background: 'var(--do-surf2)',
                      color: 'var(--do-text)',
                      fontSize: 13,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 10 }}>
                  Choose Provider
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {PROVIDER_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setAddProvider(opt.id);
                        if (opt.id === 'smtp') setAddStep('smtp');
                        else handleOAuthConnect(opt.id);
                      }}
                      disabled={connectLoading}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        borderRadius: 'var(--do-r)',
                        border: '1px solid var(--do-border)',
                        background: 'var(--do-surf2)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all .15s',
                        opacity: connectLoading ? .6 : 1,
                      }}
                    >
                      <span style={{ fontSize: 22 }}><Icon name={opt.icon} size={22} /></span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--do-text)' }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--do-text3)', marginTop: 1 }}>
                          {opt.id === 'smtp' ? 'Manual SMTP/IMAP configuration' : `Sign in with ${opt.label}`}
                        </div>
                      </div>
                      <span style={{ marginLeft: 'auto', color: 'var(--do-text4)', fontSize: 16 }}>›</span>
                    </button>
                  ))}
                </div>

                <CollapsibleInfo title="OAuth redirect URI">
                  <p>When configuring your OAuth app, add this redirect URI:</p>
                  <RedirectUriBlock uri={`${window.location.origin}/api/oauth/callback`} />
                </CollapsibleInfo>
              </div>
            )}

            {/* SMTP form */}
            {addStep === 'smtp' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { label: 'SMTP Host', key: 'host', type: 'text', placeholder: 'smtp.gmail.com' },
                  { label: 'SMTP Port', key: 'port', type: 'number', placeholder: '587' },
                  { label: 'Username / Email', key: 'user', type: 'email', placeholder: 'you@domain.com' },
                  { label: 'Password / App Password', key: 'pass', type: 'password', placeholder: '••••••••' },
                  { label: 'IMAP Host', key: 'imap_host', type: 'text', placeholder: 'imap.gmail.com' },
                  { label: 'IMAP Port', key: 'imap_port', type: 'number', placeholder: '993' },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--do-text4)', letterSpacing: '.4px', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      {label}
                    </label>
                    <input
                      type={type}
                      value={addSmtp[key]}
                      onChange={e => setAddSmtp(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                      placeholder={placeholder}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 'var(--do-r-sm)',
                        border: '1px solid var(--do-border-dark)',
                        background: 'var(--do-surf2)',
                        color: 'var(--do-text)',
                        fontSize: 13,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button className="do-btn-outline" onClick={() => setAddStep('provider')} style={{ flex: 1 }}>
                    ← Back
                  </button>
                  <button
                    className="do-btn-gold"
                    onClick={handleSmtpConnect}
                    disabled={connectLoading || !addSmtp.host || !addSmtp.user || !addSmtp.pass}
                    style={{ flex: 1 }}
                  >
                    {connectLoading ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {/* OAuth waiting */}
            {addStep === 'oauth_wait' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><Icon name="lock" size={40} /></div>
                <div style={{ fontFamily: 'var(--do-font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--do-text)', marginBottom: 8 }}>
                  Complete sign-in in the popup
                </div>
                <div style={{ fontSize: 13, color: 'var(--do-text3)', marginBottom: 24 }}>
                  A sign-in window has opened. After authorising, this dialog will close automatically.
                </div>
                <div style={{
                  display: 'inline-block',
                  width: 36, height: 36,
                  border: '3px solid var(--do-border)',
                  borderTopColor: 'var(--do-gold)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                <div style={{ marginTop: 20 }}>
                  <button className="do-btn-outline" onClick={() => { setAddStep('provider'); clearInterval(oauthPollRef.current.interval); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ Pause Modal ════════════════ */}
      {showPause && pauseInbox && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--do-surface)',
            border: '1px solid var(--do-border)',
            borderRadius: 'var(--do-r-xl)',
            boxShadow: 'var(--do-shadow-lg)',
            width: '100%', maxWidth: 440,
            padding: 28,
          }}>
            <div style={{ fontFamily: 'var(--do-font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--do-text)', marginBottom: 6 }}>
              Pause inbox
            </div>
            <div style={{ fontSize: 13, color: 'var(--do-text3)', marginBottom: 20 }}>
              What should happen to leads currently assigned to <strong>{pauseInbox.name || pauseInbox.email}</strong>?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {[
                { value: 'reassign', label: 'Reassign leads', desc: 'Move pending leads to other active inboxes automatically.' },
                { value: 'pause',   label: 'Pause with inbox', desc: 'Keep leads assigned here; they resume when this inbox resumes.' },
              ].map(opt => (
                <label key={opt.value} style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 14px',
                  border: `1px solid ${pauseAction === opt.value ? 'var(--do-gold)' : 'var(--do-border)'}`,
                  borderRadius: 'var(--do-r)',
                  cursor: 'pointer',
                  background: pauseAction === opt.value ? 'var(--do-gold-bg)' : 'var(--do-surface)',
                  transition: 'all .15s',
                }}>
                  <input
                    type="radio"
                    name="pause_action"
                    value={opt.value}
                    checked={pauseAction === opt.value}
                    onChange={() => setPauseAction(opt.value)}
                    style={{ marginTop: 3, accentColor: 'var(--do-gold-dark)' }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--do-text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--do-text3)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="do-btn-outline" style={{ flex: 1 }} onClick={() => { setShowPause(false); setPauseInbox(null); }}>
                Cancel
              </button>
              <button className="do-btn-gold" style={{ flex: 1 }} onClick={handlePauseConfirm}>
                Pause Inbox
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ Unsaved Changes Warning ════════════════ */}
      {showUnsaved && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001,
        }}>
          <div style={{
            background: 'var(--do-surface)',
            border: '1px solid var(--do-border)',
            borderRadius: 'var(--do-r-xl)',
            boxShadow: 'var(--do-shadow-lg)',
            width: '100%', maxWidth: 380,
            padding: 28,
          }}>
            <div style={{ fontFamily: 'var(--do-font-serif)', fontSize: 18, fontWeight: 700, color: 'var(--do-text)', marginBottom: 8 }}>
              Unsaved changes
            </div>
            <div style={{ fontSize: 13, color: 'var(--do-text3)', marginBottom: 22, lineHeight: 1.5 }}>
              You have unsaved changes to this inbox. What would you like to do?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="do-btn-gold" onClick={handleUnsavedSaveFirst}>
                Save &amp; switch
              </button>
              <button className="do-btn-outline" onClick={handleUnsavedDiscard}>
                Discard &amp; switch
              </button>
              <button
                onClick={() => { setShowUnsaved(false); setPendingSelectId(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--do-text4)', fontSize: 13, cursor: 'pointer', padding: '4px 0' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}