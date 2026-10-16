import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSystemHealth } from '../context/SystemHealthContext';
import { useAppMode } from '../context/AppModeContext';
import { RiRefreshLine, RiCheckboxCircleLine, RiErrorWarningLine, RiCloseCircleLine, RiQuestionLine, RiNotificationOffLine, RiNotificationLine, RiInboxLine, RiRobot2Line, RiSettings3Line, RiArrowRightSLine, RiShieldCheckLine, RiTimeLine, RiCheckLine, RiGlobalLine } from '../components/ui/aegisRi';
import { RiGoogleLine, RiWindowsLine } from 'react-icons/ri';
import Icon from '../components/ui/AegisIcon';

/* ── scoped styles ─────────────────────────────────────────────────────── */
const CSS = `
.sh-hero {
  background: var(--gold-dim);
  padding: 2rem 2rem 2rem;
}
.sh-hero-eyebrow {
  font-family: var(--font-ui);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 0.4rem;
}
.sh-hero-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 0.25rem;
}
.sh-hero-sub {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0 0 1.5rem;
}
.sh-hero-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 0.6rem;
  border: 1px solid var(--border);
  background: rgba(0,0,0,0.25);
}
.sh-hero-banner.ok    { border-color: rgba(74,222,128,0.35);  background: rgba(0,0,0,0.2); }
.sh-hero-banner.error { border-color: rgba(248,113,113,0.35); background: rgba(0,0,0,0.2); }
.sh-hero-banner.warning { border-color: rgba(251,191,36,0.35); background: rgba(0,0,0,0.2); }
.sh-status-dot {
  position: relative;
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
}
.sh-status-dot.ok      { background: var(--success); }
.sh-status-dot.error   { background: var(--danger); }
.sh-status-dot.warning { background: var(--warning); }
.sh-status-dot.unknown { background: var(--bg-input); }
.sh-status-dot.pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  animation: sh-ping 1.2s cubic-bezier(0,0,0.2,1) infinite;
}
.sh-status-dot.ok.pulse::after    { background: var(--success); }
.sh-status-dot.error.pulse::after { background: var(--danger); }
.sh-status-dot.warning.pulse::after { background: var(--warning); }
@keyframes sh-ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}
.sh-hero-headline {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 0.15rem;
}
.sh-hero-desc { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
.sh-refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  padding: 0.4rem 0.9rem;
  border-radius: 0.4rem;
  border: 1px solid var(--border-active);
  background: var(--gold-hover);
  color: var(--text);
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}
.sh-refresh-btn:hover { background: var(--gold-dim); }
.sh-refresh-btn:disabled { opacity: 0.5; cursor: default; }
.sh-spin { animation: sh-spin 0.8s linear infinite; }
@keyframes sh-spin { to { transform: rotate(360deg); } }
.sh-content { max-width: 64rem; margin: 0 auto; padding: 1.75rem 2rem 3rem; }
.sh-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  gap: 1rem;
  margin-top: 1.25rem;
}
.sh-card {
  border: 1px solid var(--do-border);
  border-radius: 0.6rem;
  background: var(--do-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: opacity 0.2s;
}
.sh-card.muted { opacity: 0.55; }
.sh-card.ok      { border-color: var(--success-line); }
.sh-card.error   { border-color: var(--danger-line); }
.sh-card.warning { border-color: var(--warning-line); }
.sh-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--do-border);
  gap: 0.5rem;
}
.sh-card-head.ok      { background: var(--success-dim); border-color: var(--success-line); }
.sh-card-head.error   { background: var(--danger-dim); border-color: var(--danger-line); }
.sh-card-head.warning { background: var(--warning-dim); border-color: var(--warning-line); }
.sh-card-head.unknown { background: var(--do-cream); }
.sh-card-head.muted   { background: var(--do-cream); }
.sh-card-icon-ok      { color: var(--success); }
.sh-card-icon-error   { color: var(--danger); }
.sh-card-icon-warning { color: var(--warning); }
.sh-card-icon-unknown { color: var(--text-muted); }
.sh-card-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--do-text);
  flex: 1;
}
.sh-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sh-badge.ok      { background: var(--success-dim); color: var(--success); }
.sh-badge.error   { background: var(--danger-dim); color: var(--danger); }
.sh-badge.warning { background: var(--warning-dim); color: var(--warning); }
.sh-badge.unknown { background: var(--bg-input); color: var(--text-muted); }
.sh-badge.muted   { background: var(--do-border); color: var(--do-text-muted); }
.sh-mute-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--do-text-muted);
  padding: 0.15rem;
  border-radius: 0.25rem;
  line-height: 0;
  transition: color 0.15s;
}
.sh-mute-btn:hover { color: var(--do-text); }
.sh-card-body { padding: 0.75rem 0.85rem; flex: 1; display: flex; flex-direction: column; gap: 0.6rem; }
.sh-detail { font-size: 0.78rem; color: var(--do-text-muted); }
.sh-issue { display: flex; flex-direction: column; gap: 0.25rem; }
.sh-issue-row { display: flex; align-items: flex-start; gap: 0.4rem; }
.sh-issue-text { font-size: 0.8rem; color: var(--do-text); line-height: 1.45; }
.sh-fix-row { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; margin-left: 1.25rem; }
.sh-fix-text { font-size: 0.72rem; color: var(--do-text-muted); }
.sh-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.55rem;
  border-radius: 0.3rem;
  background: var(--do-gold-bg);
  color: var(--do-gold-dark);
  border: 1px solid var(--do-gold);
  text-decoration: none;
  transition: background 0.12s;
}
.sh-action-btn:hover { background: var(--do-gold); color: var(--on-gold); }
.sh-healthy-note {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--success);
}
.sh-meta-divider {
  border-top: 1px solid var(--do-border);
  padding-top: 0.6rem;
  margin-top: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.sh-meta-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--do-text-muted);
  margin-bottom: 0.15rem;
}
.sh-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.78rem;
}
.sh-meta-key { color: var(--do-text-muted); }
.sh-meta-val { color: var(--do-text); font-size: 0.75rem; font-weight: 500; }
.sh-token-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}
.sh-token-valid    { background: var(--success-dim); color: var(--success); }
.sh-token-expiring { background: var(--warning-dim); color: var(--warning); }
.sh-token-expired  { background: var(--danger-dim); color: var(--danger); }
.sh-unmute-all {
  font-size: 0.75rem;
  padding: 0.35rem 0.85rem;
  border-radius: 0.4rem;
  border: 1px solid var(--do-gold);
  color: var(--do-gold-dark);
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
}
.sh-unmute-all:hover { background: var(--do-gold-bg); }
.sh-error-box {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--danger-line);
  background: var(--danger-dim);
  font-size: 0.8rem;
  color: var(--danger);
  margin-bottom: 1rem;
}
.sh-footer {
  font-size: 0.72rem;
  color: var(--do-text-muted);
  text-align: center;
  padding-top: 1.5rem;
}
.sh-time-note {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}
`;

/* ── helpers ───────────────────────────────────────────────────────────── */

function statusClass(status) {
  if (status === 'error')   return 'error';
  if (status === 'warning') return 'warning';
  if (status === 'ok')      return 'ok';
  return 'unknown';
}

function statusLabel(status) {
  if (status === 'error')   return 'Error';
  if (status === 'warning') return 'Warning';
  if (status === 'ok')      return 'Healthy';
  return 'Unknown';
}

function StatusIcon({ status, size = 18 }) {
  const cls = `sh-card-icon-${statusClass(status)}`;
  if (status === 'error')   return <RiCloseCircleLine    size={size} className={cls} />;
  if (status === 'warning') return <RiErrorWarningLine   size={size} className={cls} />;
  if (status === 'ok')      return <RiCheckboxCircleLine size={size} className={cls} />;
  return                           <RiQuestionLine       size={size} className={cls} />;
}

function IssueLevelIcon({ level }) {
  if (level === 'error')   return <RiCloseCircleLine  size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '0.1rem' }} />;
  if (level === 'warning') return <RiErrorWarningLine size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '0.1rem' }} />;
  return                          <RiCheckLine        size={14} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '0.1rem' }} />;
}

function CategoryIcon({ icon, size = 18 }) {
  switch (icon) {
    case 'google':    return <RiGoogleLine      size={size} />;
    case 'microsoft': return <RiWindowsLine     size={size} />;
    case 'inbox':     return <RiInboxLine       size={size} />;
    case 'sync':      return <RiRefreshLine     size={size} />;
    case 'ai':        return <RiRobot2Line      size={size} />;
    case 'settings':  return <RiSettings3Line   size={size} />;
    case 'verify':    return <RiShieldCheckLine size={size} />;
    case 'domain':    return <RiGlobalLine      size={size} />;
    default:          return <RiShieldCheckLine size={size} />;
  }
}

function RelativeTime({ date }) {
  if (!date) return null;
  const delta = Math.round((Date.now() - date) / 1000);
  let label;
  if (delta < 10)    label = 'just now';
  else if (delta < 60)    label = `${delta}s ago`;
  else if (delta < 3600)  label = `${Math.floor(delta / 60)}m ago`;
  else                    label = `${Math.floor(delta / 3600)}h ago`;
  return <span>{label}</span>;
}

function TokenStatusBadge({ status }) {
  if (status === 'valid')         return <span className="sh-token-badge sh-token-valid">Valid</span>;
  if (status === 'expiring_soon') return <span className="sh-token-badge sh-token-expiring">Expiring</span>;
  return                                  <span className="sh-token-badge sh-token-expired">Expired</span>;
}

/* ── CheckMeta ─────────────────────────────────────────────────────────── */

function CheckMeta({ check }) {
  const { isProduction } = useAppMode();

  if (check.id === 'google_oauth' && check.meta.accounts?.length > 0) {
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-label">Connected accounts</div>
        {check.meta.accounts.map(acc => (
          <div key={acc.id} className="sh-meta-row">
            <span className="sh-meta-key" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.google_email}</span>
            <TokenStatusBadge status={acc.token_status} />
          </div>
        ))}
      </div>
    );
  }

  if (check.id === 'microsoft_oauth' && check.meta.accounts?.length > 0) {
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-label">Connected accounts</div>
        {check.meta.accounts.map(acc => (
          <div key={acc.id} className="sh-meta-row">
            <span className="sh-meta-key" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.microsoft_email}</span>
            <TokenStatusBadge status={acc.token_status} />
          </div>
        ))}
      </div>
    );
  }

  if (check.id === 'inbox_status' && check.meta.inboxList?.length > 0) {
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-label">Inboxes</div>
        {check.meta.inboxList.map(inbox => (
          <div key={inbox.id} className="sh-meta-row">
            <span className="sh-meta-key" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inbox.display_name || inbox.email}</span>
            {inbox.paused
              ? <span className="sh-token-badge sh-token-expiring">Paused</span>
              : <span className="sh-token-badge sh-token-valid">Active</span>
            }
          </div>
        ))}
      </div>
    );
  }

  if (check.id === 'unibox_sync') {
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-row">
          <span className="sh-meta-key">Push notifications</span>
          {check.meta.pushEnabled
            ? <span className="sh-token-badge sh-token-valid">Enabled</span>
            : <span className="sh-token-badge" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>Polling</span>
          }
        </div>
        {check.meta.syncInProgress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--info)' }}>
            <RiRefreshLine size={13} className="sh-spin" />
            <span>Sync in progress for {check.meta.inflightIds.length} inbox{check.meta.inflightIds.length !== 1 ? 'es' : ''}</span>
          </div>
        )}
      </div>
    );
  }

  if (check.id === 'ai_features' && check.meta.allFeatures?.length > 0) {
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-label">Features</div>
        {check.meta.allFeatures.map(f => (
          <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <div className="sh-meta-row">
              <span className="sh-meta-key" style={{ opacity: f.enabled ? 1 : 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
              <span className={`sh-token-badge ${
                !f.enabled ? '' :
                !f.api_key_set ? 'sh-token-expiring' :
                !f.connection_tested ? '' :
                f.last_error ? 'sh-token-expired' : 'sh-token-valid'
              }`} style={!f.enabled ? { background: 'var(--bg-input)', color: 'var(--text-muted)' } : !f.connection_tested && f.api_key_set ? { background: 'var(--warning-dim)', color: 'var(--warning)' } : {}}>
                {!f.enabled ? 'Disabled' : !f.api_key_set ? 'Missing key' : !f.connection_tested ? 'Not tested' : f.last_error ? 'Error' : 'Healthy'}
              </span>
            </div>
            {f.enabled && f.last_error && (
              <p style={{ fontSize: '0.7rem', color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: '0.25rem' }}>
                {f.last_error_at ? new Date(f.last_error_at).toLocaleString() + ': ' : ''}{f.last_error}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (check.id === 'email_verification') {
    const ev = check.meta.emailVerification;
    if (!ev) return null;
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-row">
          <span className="sh-meta-key">Status</span>
          {!ev.enabled
            ? <span className="sh-token-badge" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>Disabled</span>
            : ev.connection_tested
              ? <span className="sh-token-badge sh-token-valid">Tested <Icon name="check" size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} /></span>
              : <span className="sh-token-badge" style={{ background: 'var(--warning-dim)', color: 'var(--warning)' }}>Not tested</span>
          }
        </div>
        {ev.enabled && (
          <div className="sh-meta-row">
            <span className="sh-meta-key">Provider</span>
            <span className="sh-meta-val">{ev.provider}</span>
          </div>
        )}
        {ev.last_error && (
          <p style={{ fontSize: '0.7rem', color: 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ev.last_error_at ? new Date(ev.last_error_at).toLocaleString() + ': ' : ''}{ev.last_error}
          </p>
        )}
      </div>
    );
  }

  if (check.id === 'active_settings') {
    if (isProduction) return null;
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-row">
          <span className="sh-meta-key">Test Mode</span>
          {check.meta.testMode
            ? <span className="sh-token-badge sh-token-expiring">Active</span>
            : <span className="sh-token-badge sh-token-valid">Off</span>
          }
        </div>
      </div>
    );
  }

  if (check.id === 'tracking_domains' && check.meta.inboxesWithDomains?.length > 0) {
    return (
      <div className="sh-meta-divider">
        <div className="sh-meta-label">Domains</div>
        {check.meta.inboxesWithDomains.map(inbox => (
          <div key={inbox.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <div className="sh-meta-row">
              <span className="sh-meta-key" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inbox.display_name || inbox.email}</span>
              {inbox.tracking_domain_status === 'ok'
                ? <span className="sh-token-badge sh-token-valid">Connected</span>
                : <span className="sh-token-badge sh-token-expired">Not connected</span>
              }
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--do-text-muted)', marginLeft: '0.25rem' }}>{inbox.tracking_domain}</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

/* ── CheckCard ─────────────────────────────────────────────────────────── */

function CheckCard({ check, muted, onToggleMute }) {
  const isMuted = muted.has(check.id);
  const displayStatus = isMuted ? 'ok' : check.status;
  const sc = statusClass(displayStatus);
  const headClass = isMuted ? 'muted' : sc;

  return (
    <div className={`sh-card ${sc} ${isMuted ? 'muted' : ''}`}>
      <div className={`sh-card-head ${headClass}`}>
        <div className={`sh-card-icon-${isMuted ? 'unknown' : statusClass(check.status)}`} style={{ lineHeight: 0, flexShrink: 0 }}>
          <CategoryIcon icon={check.icon} size={17} />
        </div>
        <span className="sh-card-label">{check.label}</span>
        {isMuted && <span style={{ fontSize: '0.7rem', color: 'var(--do-text-muted)', fontStyle: 'italic' }}>(muted)</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <span className={`sh-badge ${isMuted ? 'muted' : sc}`}>{isMuted ? 'Muted' : statusLabel(check.status)}</span>
          <button
            className="sh-mute-btn"
            onClick={() => onToggleMute(check.id)}
            title={isMuted ? 'Unmute this check' : "Mute this check (won't affect overall health)"}
          >
            {isMuted ? <RiNotificationLine size={15} /> : <RiNotificationOffLine size={15} />}
          </button>
        </div>
      </div>

      <div className="sh-card-body">
        <p className="sh-detail">{check.detail}</p>

        {check.issues.length > 0 && !isMuted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {check.issues.map((issue, i) => (
              <div key={i} className="sh-issue">
                <div className="sh-issue-row">
                  <IssueLevelIcon level={issue.level} />
                  <span className="sh-issue-text">{issue.text}</span>
                </div>
                {issue.fix && (
                  <div className="sh-fix-row">
                    <span className="sh-fix-text" style={{ color: 'var(--do-text-muted)' }}>→</span>
                    <span className="sh-fix-text">{issue.fix}</span>
                    {issue.action && (
                      <Link to={issue.action.to} className="sh-action-btn">
                        {issue.action.label}
                        <RiArrowRightSLine size={12} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="sh-healthy-note">
            <RiCheckboxCircleLine size={14} />
            <span>{isMuted ? 'Warnings suppressed for this category' : 'No issues detected'}</span>
          </div>
        )}

        <CheckMeta check={check} />
      </div>
    </div>
  );
}

/* ── main ──────────────────────────────────────────────────────────────── */

export default function SystemHealth() {
  const { checks, loading, lastChecked, fetchError, refresh, muted, toggleMute, overallStatus } = useSystemHealth();

  const issueCount = checks.reduce((n, c) => muted.has(c.id) ? n : n + c.issues.length, 0);
  const mutedCount = checks.filter(c => muted.has(c.id)).length;

  const STATUS_RANK = { error: 3, warning: 2, ok: 1, unknown: 0 };
  const sortedChecks = [...checks].sort((a, b) => {
    const aM = muted.has(a.id), bM = muted.has(b.id);
    if (aM !== bM) return aM ? 1 : -1;
    return (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0);
  });

  const unmuteAll = useCallback(() => {
    checks.forEach(c => { if (muted.has(c.id)) toggleMute(c.id); });
  }, [checks, muted, toggleMute]);

  const sc = statusClass(overallStatus);

  const heroMessages = {
    error:   { headline: 'Action Required',       desc: `${issueCount} issue${issueCount !== 1 ? 's' : ''} found — one or more services need attention.` },
    warning: { headline: 'Warnings Detected',     desc: `${issueCount} thing${issueCount !== 1 ? 's' : ''} could be improved.` },
    ok:      { headline: 'Everything looks good', desc: 'All monitored services are healthy.' },
    unknown: { headline: 'Status unknown',        desc: 'Could not fetch health data.' },
  };
  const msg = heroMessages[overallStatus] || heroMessages.unknown;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <style>{CSS}</style>

      {/* Hero */}
      <div className="sh-hero">
        <div className="sh-hero-eyebrow">InboxAir / System</div>
        <h1 className="sh-hero-title">System Health</h1>
        <p className="sh-hero-sub">Monitor connections, OAuth tokens, and feature configuration.</p>

        <div className={`sh-hero-banner ${sc}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <div className={`sh-status-dot ${sc} ${sc === 'error' || sc === 'warning' ? 'pulse' : ''}`} />
            <div>
              <div className="sh-hero-headline">{msg.headline}</div>
              <div className="sh-hero-desc">{msg.desc}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            {lastChecked && (
              <div className="sh-time-note">
                <RiTimeLine size={13} />
                <RelativeTime date={lastChecked} />
              </div>
            )}
            <button className="sh-refresh-btn" onClick={refresh} disabled={loading}>
              <RiRefreshLine size={14} className={loading ? 'sh-spin' : ''} />
              {loading ? 'Checking…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="sh-content">
        {fetchError && (
          <div className="sh-error-box">Failed to fetch health data: {fetchError}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)' }}>
            {checks.length} {checks.length === 1 ? 'check' : 'checks'} monitored
            {mutedCount > 0 && ` · ${mutedCount} muted`}
          </p>
          {mutedCount > 0 && (
            <button className="sh-unmute-all" onClick={unmuteAll}>
              Unmute all ({mutedCount})
            </button>
          )}
        </div>

        {checks.length > 0 ? (
          <div className="sh-grid">
            {sortedChecks.map(check => (
              <CheckCard key={check.id} check={check} muted={muted} onToggleMute={toggleMute} />
            ))}
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--do-text-muted)' }}>
            <RiRefreshLine size={32} className="sh-spin" style={{ display: 'block', margin: '0 auto 0.75rem' }} />
            <p style={{ fontSize: '0.85rem' }}>Loading health data…</p>
          </div>
        ) : null}

        <p className="sh-footer">
          Health data refreshes automatically every 5 minutes and when you click Refresh.
          Muted checks are stored locally and do not affect other users.
        </p>
      </div>
    </div>
  );
}