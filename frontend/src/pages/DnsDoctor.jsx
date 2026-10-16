import { useState } from 'react';
import { RiCheckboxCircleLine, RiErrorWarningLine, RiCloseCircleLine, RiGlobalLine, RiFileCopyLine, RiCheckLine, RiSearchLine, RiShieldCheckLine } from '../components/ui/aegisRi';
import { api } from '../api';

const css = `
  /* ── DNS Records page ── */
  .dns-body {
    padding: 1.75rem 2rem;
    max-width: 780px;
    margin: 0 auto;
  }

  /* score card */
  .dns-score-card {
    background: var(--do-surface);
    border: 1px solid var(--do-border);
    border-radius: var(--do-r-lg);
    padding: 1rem 1.4rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    box-shadow: var(--do-shadow-sm);
  }
  .dns-score-label { font-size: 0.72rem; color: var(--do-text4); margin: 0 0 0.15rem; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  .dns-score-domain { font-size: 1rem; font-weight: 700; color: var(--do-text); margin: 0; font-family: var(--do-font-mono); }
  .dns-grade { font-size: 2.4rem; font-weight: 800; line-height: 1; font-family: var(--do-font-serif); }
  .dns-grade.A { color: var(--do-green); }
  .dns-grade.B { color: var(--do-blue); }
  .dns-grade.C { color: var(--do-gold-dark); }
  .dns-grade.D { color: var(--do-orange); }
  .dns-grade.F { color: var(--do-red); }
  .dns-score-num { font-size: 0.78rem; color: var(--do-text4); font-family: var(--do-font-mono); }

  /* overall banner */
  .dns-overall-banner {
    border-radius: var(--do-r);
    padding: 0.7rem 1rem;
    font-size: 0.83rem;
    font-weight: 600;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .dns-overall-banner.pass    { background: var(--do-green-light); border: 1px solid var(--do-green); color: var(--do-green-dark); }
  .dns-overall-banner.warning { background: var(--do-orange-light); border: 1px solid var(--do-orange); color: var(--do-orange-dark); }
  .dns-overall-banner.fail    { background: var(--do-red-light); border: 1px solid var(--do-red); color: var(--do-red-dark); }

  /* record cards — all use design system radius */
  .dns-record-card {
    background: var(--do-surface);
    border-radius: var(--do-r-lg);
    overflow: hidden;
    margin-bottom: 0.75rem;
    box-shadow: var(--do-shadow-xs);
  }
  .dns-record-card.pass    { border: 1px solid var(--do-green); }
  .dns-record-card.warning { border: 1px solid var(--do-orange); }
  .dns-record-card.fail    { border: 1px solid var(--do-red); }
  .dns-record-card.unknown { border: 1px solid var(--do-border); }

  .dns-card-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
  }
  .dns-card-hdr.pass    { background: var(--do-green-light); border-bottom: 1px solid var(--do-green); }
  .dns-card-hdr.warning { background: var(--do-orange-light); border-bottom: 1px solid var(--do-orange); }
  .dns-card-hdr.fail    { background: var(--do-red-light); border-bottom: 1px solid var(--do-red); }
  .dns-card-hdr.unknown { background: var(--do-surf2); border-bottom: 1px solid var(--do-border); }

  .dns-card-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.83rem;
    font-weight: 700;
    color: var(--do-text);
    font-family: var(--do-font-mono);
    letter-spacing: 0.05em;
  }
  .dns-status-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 0.15rem 0.55rem;
    border-radius: var(--do-r-full);
  }
  .dns-status-badge.pass    { background: var(--do-green-light);  color: var(--do-green-dark); border: 1px solid var(--do-green); }
  .dns-status-badge.warning { background: var(--do-orange-light); color: var(--do-orange-dark); border: 1px solid var(--do-orange); }
  .dns-status-badge.fail    { background: var(--do-red-light);    color: var(--do-red-dark); border: 1px solid var(--do-red); }
  .dns-status-badge.unknown { background: var(--do-surf3);        color: var(--do-text4); border: 1px solid var(--do-border); }

  .dns-card-body { padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .dns-record-mono {
    font-family: var(--do-font-mono);
    font-size: 0.72rem;
    color: var(--do-text);
    background: var(--do-surf2);
    border: 1px solid var(--do-border);
    border-radius: var(--do-r-sm);
    padding: 0.5rem 0.7rem;
    word-break: break-all;
    line-height: 1.6;
  }
  .dns-msg {
    font-size: 0.8rem;
    color: var(--do-text3);
    line-height: 1.55;
    margin: 0;
  }
  .dns-suggested-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .dns-suggested-mono {
    font-family: var(--do-font-mono);
    font-size: 0.72rem;
    color: var(--do-orange-dark);
    background: var(--do-orange-light);
    border: 1px solid var(--do-orange);
    border-radius: var(--do-r-sm);
    padding: 0.5rem 0.7rem;
    word-break: break-all;
    flex: 1;
    line-height: 1.6;
  }
  .dns-copy-btn {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.3rem 0.65rem;
    border-radius: var(--do-r-sm);
    border: 1px solid var(--do-border-dark);
    background: var(--do-surface);
    color: var(--do-text3);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
  }
  .dns-copy-btn:hover { background: var(--do-surf2); color: var(--do-text); }
  .dns-copy-btn.copied { color: var(--do-green-dark); border-color: var(--do-green); }

  /* hero form */
  .dns-hero-form {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 560px;
  }
  .dns-input-row { display: flex; gap: 0.6rem; align-items: center; }
  .dns-input-wrap { position: relative; flex: 1; }
  .dns-input-wrap svg {
    position: absolute; left: 0.75rem; top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }
  .dns-input {
    width: 100%; padding: 0.6rem 0.75rem 0.6rem 2.2rem;
    font-size: 0.9rem; border-radius: var(--do-r-sm);
    border: 1px solid var(--border-active);
    background: var(--gold-dim); color: var(--text);
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .dns-input::placeholder { color: var(--text-muted); }
  .dns-input:focus { border-color: var(--do-gold); box-shadow: 0 0 0 3px var(--border); }
  .dns-input-selector {
    width: 100%; padding: 0.5rem 0.75rem;
    font-size: 0.78rem; border-radius: var(--do-r-sm);
    border: 1px solid var(--border);
    background: var(--gold-hover); color: var(--text);
    outline: none; box-sizing: border-box;
  }
  .dns-input-selector:focus { border-color: var(--do-gold); }

  /* error */
  .dns-error {
    background: var(--do-red-light); border: 1px solid var(--do-red);
    border-radius: var(--do-r); padding: 0.85rem 1.1rem;
    font-size: 0.83rem; color: var(--do-red-dark); margin-bottom: 1rem;
  }

  /* loading */
  @keyframes dns-spin { to { transform: rotate(360deg); } }
  .dns-spinner {
    width: 2.5rem; height: 2.5rem;
    border: 3px solid var(--do-border);
    border-top-color: var(--do-gold);
    border-radius: 50%;
    animation: dns-spin 0.8s linear infinite;
    margin: 0 auto 1rem;
  }
  .dns-loading { text-align: center; padding: 3rem 0; color: var(--do-text3); }
  .dns-loading p { font-size: 0.83rem; margin: 0; }

  /* empty */
  .dns-empty { text-align: center; padding: 3.5rem 1rem; color: var(--do-text3); }
  .dns-empty-icon { opacity: 0.2; margin: 0 auto 1rem; display: block; }
  .dns-empty h3 { font-family: var(--do-font-serif); font-size: 1.05rem; color: var(--do-text); margin: 0 0 0.4rem; font-weight: 700; }
  .dns-empty p { font-size: 0.83rem; margin: 0 auto; max-width: 36ch; }
`;

function statusVariant(s) {
  if (s === 'fail') return 'fail';
  if (s === 'warning') return 'warning';
  if (s === 'pass') return 'pass';
  return 'unknown';
}
function statusLabel(s) {
  if (s === 'fail') return 'Fail';
  if (s === 'warning') return 'Warning';
  if (s === 'pass') return 'Pass';
  return 'Unknown';
}

function StatusIcon({ status, size = 18 }) {
  const style = { flexShrink: 0 };
  if (status === 'fail')    return <RiCloseCircleLine    size={size} style={{ ...style, color: 'var(--do-red)' }} />;
  if (status === 'warning') return <RiErrorWarningLine   size={size} style={{ ...style, color: 'var(--do-orange)' }} />;
  if (status === 'pass')    return <RiCheckboxCircleLine size={size} style={{ ...style, color: 'var(--do-green)' }} />;
  return <RiGlobalLine size={size} style={{ ...style, color: 'var(--do-text4)' }} />;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <button onClick={doCopy} className={`dns-copy-btn${copied ? ' copied' : ''}`}>
      {copied ? <RiCheckLine size={12} /> : <RiFileCopyLine size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function HealthScoreHeader({ score, grade, domain }) {
  const g = grade || 'F';
  return (
    <div className="dns-score-card">
      <div>
        <p className="dns-score-label">Deliverability Health</p>
        <p className="dns-score-domain">{domain}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
        <span className={`dns-grade ${g}`}>{g}</span>
        <span className="dns-score-num">{score}/100</span>
      </div>
    </div>
  );
}

function RecordCard({ title, result }) {
  const v = statusVariant(result.status);
  return (
    <div className={`dns-record-card ${v}`}>
      <div className={`dns-card-hdr ${v}`}>
        <div className="dns-card-title">
          <StatusIcon status={result.status} size={15} />
          {title}
        </div>
        <span className={`dns-status-badge ${v}`}>{statusLabel(result.status)}</span>
      </div>
      <div className="dns-card-body">
        {result.record && <div className="dns-record-mono">{result.record}</div>}
        {result.message && <p className="dns-msg">{result.message}</p>}
        {result.suggested_record && (
          <div className="dns-suggested-row">
            <div className="dns-suggested-mono">{result.suggested_record}</div>
            <CopyButton text={result.suggested_record} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function DnsDoctor() {
  const [domain, setDomain] = useState('');
  const [dkimSelector, setDkimSelector] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runCheck = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ domain: domain.trim() });
      if (dkimSelector.trim()) params.set('dkim_selector', dkimSelector.trim());
      const data = await api.get(`/dns-doctor/check?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Check failed'); setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>

        {/* Hero */}
        <div className="do-hero" style={{ borderRadius: 0 }}>
          <div className="do-hero-eyebrow">InboxAir · Tools</div>
          <div className="do-hero-title">DNS Records</div>
          <div className="do-hero-sub">
            Full deliverability audit — SPF, DKIM, DMARC, MTA-STS, TLS-RPT, BIMI, DNSSEC, and blacklist status.
          </div>
          <form onSubmit={runCheck} className="dns-hero-form">
            <div className="dns-input-row">
              <div className="dns-input-wrap">
                <RiGlobalLine size={17} />
                <input
                  type="text" className="dns-input"
                  value={domain} onChange={e => setDomain(e.target.value)}
                  placeholder="example.com" autoComplete="off" spellCheck={false}
                />
              </div>
              <button
                type="submit" disabled={loading || !domain.trim()}
                className="do-btn-hero"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}
              >
                <RiSearchLine size={15} />
                {loading ? 'Checking…' : 'Check'}
              </button>
            </div>
            <input
              type="text" className="dns-input-selector"
              value={dkimSelector} onChange={e => setDkimSelector(e.target.value)}
              placeholder="DKIM selector (optional — e.g. google, s1, default)"
              autoComplete="off" spellCheck={false}
            />
          </form>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--do-bg)' }}>
          <div className="dns-body">

            {error && (
              <div className="dns-error"><strong>Check failed:</strong> {error}</div>
            )}

            {loading && (
              <div className="dns-loading">
                <div className="dns-spinner" />
                <p>Running DNS checks for <strong>{domain}</strong>…</p>
              </div>
            )}

            {result && !loading && (
              <div>
                <HealthScoreHeader score={result.health_score} grade={result.health_grade} domain={result.domain} />
                <div className={`dns-overall-banner ${statusVariant(result.overall_status)}`}>
                  <RiShieldCheckLine size={15} />
                  {result.domain} — {statusLabel(result.overall_status)}
                </div>
                <RecordCard title="SPF"       result={result.spf} />
                <RecordCard title="DKIM"      result={result.dkim} />
                <RecordCard title="DMARC"     result={result.dmarc} />
                <RecordCard title="MTA-STS"   result={result.mta_sts} />
                <RecordCard title="TLS-RPT"   result={result.tls_rpt} />
                <RecordCard title="BIMI"      result={result.bimi} />
                <RecordCard title="DNSSEC"    result={result.dnssec} />
                <RecordCard
                  title="Blacklist"
                  result={{
                    status: result.blacklist.status,
                    record: result.blacklist.ip ? `IP: ${result.blacklist.ip}` : null,
                    message: result.blacklist.message,
                    suggested_record: null,
                  }}
                />
              </div>
            )}

            {!result && !loading && !error && (
              <div className="dns-empty">
                <RiGlobalLine size={52} className="dns-empty-icon" />
                <h3>Enter a domain to audit</h3>
                <p>We'll check SPF, DKIM, DMARC, blacklists, and more — then score your deliverability health.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}