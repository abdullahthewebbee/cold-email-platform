import { useState } from 'react';
import { api } from '../api';
import { getOS, getBrowser, APP_VERSION } from '../components/ui/Sidebar';
import Icon from '../components/ui/AegisIcon';

const BUG_TEMPLATE = { describe: '', steps: '', expected: '', actual: '' };
const FEATURE_TEMPLATE = { problem: '', solution: '', alternatives: '', context: '' };

const css = `
.fb-wrap {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--do-text);
  background: var(--do-surface);
}
.fb-inner {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ── Hero ── */
.fb-hero {
  border-radius: 14px;
  padding: 1.75rem 2rem 1.5rem;
  color: var(--text);
}
.fb-hero.bug {
  background: var(--gold-dim);
}
.fb-hero.feature {
  background: var(--gold-dim);
}
.fb-hero-eyebrow {
  font-family: var(--font-ui);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 0.45rem;
}
.fb-hero-title {
  font-family: var(--font-display);
  font-size: 1.65rem;
  font-weight: 700;
  margin: 0 0 0.3rem;
  line-height: 1.15;
  color: var(--text);
}
.fb-hero-sub {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}

/* ── Kind switcher ── */
.fb-switcher {
  display: flex;
  border: 1.5px solid var(--do-border);
  border-radius: 9px;
  overflow: hidden;
  background: var(--do-cream);
  max-width: 340px;
}
.fb-kind-btn {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--do-text-muted);
  transition: background 0.15s, color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}
.fb-kind-btn.active-bug  { background: var(--danger); color: var(--white); }
.fb-kind-btn.active-feat { background: var(--do-gold-dark); color: var(--on-gold); }

/* ── Result message ── */
.fb-result {
  font-size: 0.82rem;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  line-height: 1.45;
}
.fb-result.ok {
  background: rgba(22,163,74,0.07);
  border: 1px solid rgba(22,163,74,0.18);
  color: var(--success);
}
.fb-result.err {
  background: rgba(220,38,38,0.06);
  border: 1px solid rgba(220,38,38,0.15);
  color: var(--danger);
}

/* ── Form card ── */
.fb-form-card {
  background: var(--do-cream);
  border: 1.5px solid var(--do-border);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Field ── */
.fb-field-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--do-text-muted);
  margin-bottom: 0.3rem;
  font-family: ui-monospace, Consolas, monospace;
}
.fb-textarea {
  width: 100%;
  border: 1.5px solid var(--do-border);
  border-radius: 7px;
  padding: 0.55rem 0.75rem;
  font-size: 0.86rem;
  color: var(--do-text);
  background: var(--bg-elevated);
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  font-family: inherit;
  line-height: 1.55;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.fb-textarea:focus {
  border-color: var(--do-gold);
  box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
}
.fb-meta-note {
  font-size: 0.72rem;
  color: var(--do-text-muted);
  font-family: ui-monospace, Consolas, monospace;
}

/* ── Submit button ── */
.fb-submit {
  width: 100%;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s, color 0.15s;
}
.fb-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.fb-submit.bug {
  background: var(--danger);
  color: var(--white);
}
.fb-submit.bug:hover:not(:disabled) { background: var(--danger); }
.fb-submit.feature {
  background: var(--do-gold-dark);
  color: var(--on-gold);
}
.fb-submit.feature:hover:not(:disabled) { background: var(--do-gold); color: var(--on-gold); }
`;

function Field({ label, value, onChange, required, placeholder, rows }) {
  return (
    <div>
      <label className="fb-field-label">{label}{required && ' *'}</label>
      <textarea
        rows={rows || (label.toLowerCase().includes('steps') ? 4 : 2)}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="fb-textarea"
      />
    </div>
  );
}

export default function Feedback() {
  const params = new URLSearchParams(window.location.search);
  const initialKind = params.get('type') === 'feature' ? 'feature' : 'bug';

  const [kind, setKind] = useState(initialKind);
  const [bug, setBug] = useState(BUG_TEMPLATE);
  const [feature, setFeature] = useState(FEATURE_TEMPLATE);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const message = kind === 'bug'
        ? [
            `Describe the bug:\n${bug.describe}`,
            `Steps to reproduce:\n${bug.steps}`,
            `Expected behavior:\n${bug.expected}`,
            `Actual behavior:\n${bug.actual}`,
          ].join('\n\n')
        : [
            `Is this related to a problem?\n${feature.problem}`,
            `Describe the solution or integration you'd like:\n${feature.solution}`,
            `Alternatives considered:\n${feature.alternatives}`,
            `Additional context:\n${feature.context}`,
          ].join('\n\n');

      const meta = kind === 'bug'
        ? { OS: getOS(), Browser: getBrowser(), Version: APP_VERSION, Page: window.location.pathname }
        : {};

      const res = await api.post('/feedback', { kind, message, meta });
      setResult({ ok: res.ok, text: res.detail });
      if (res.ok) {
        setBug(BUG_TEMPLATE);
        setFeature(FEATURE_TEMPLATE);
      }
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const heroTitle = kind === 'bug' ? 'Report a bug' : 'Request a feature';
  const heroEyebrow = kind === 'bug' ? 'InboxAir · Feedback' : 'InboxAir · Feedback';

  return (
    <>
      <style>{css}</style>
      <div className="fb-wrap">
        <div className="fb-inner">

          {/* ── Hero ── */}
          <div className={`fb-hero ${kind}`}>
            <p className="fb-hero-eyebrow">{heroEyebrow}</p>
            <h1 className="fb-hero-title">{heroTitle}</h1>
            <p className="fb-hero-sub">We read every message and reply if we need more details.</p>
          </div>

          {/* ── Kind switcher ── */}
          <div className="fb-switcher">
            <button
              type="button"
              onClick={() => { setKind('bug'); setResult(null); }}
              className={`fb-kind-btn${kind === 'bug' ? ' active-bug' : ''}`}
            >
              <Icon name="alert-circle" size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Report a bug
            </button>
            <button
              type="button"
              onClick={() => { setKind('feature'); setResult(null); }}
              className={`fb-kind-btn${kind === 'feature' ? ' active-feat' : ''}`}
            >
              <Icon name="lightbulb" size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Request feature
            </button>
          </div>

          {/* ── Result ── */}
          {result && (
            <p className={`fb-result ${result.ok ? 'ok' : 'err'}`}>{result.text}</p>
          )}

          {/* ── Form ── */}
          <form onSubmit={submit} className="fb-form-card">
            {kind === 'bug' ? (
              <>
                <Field label="Describe the bug" value={bug.describe} onChange={v => setBug(b => ({ ...b, describe: v }))} required />
                <Field label="Steps to reproduce" value={bug.steps} onChange={v => setBug(b => ({ ...b, steps: v }))} placeholder={"1. Go to…\n2. Click on…\n3. See error"} />
                <Field label="Expected behavior" value={bug.expected} onChange={v => setBug(b => ({ ...b, expected: v }))} />
                <Field label="Actual behavior" value={bug.actual} onChange={v => setBug(b => ({ ...b, actual: v }))} />
                <p className="fb-meta-note">We'll automatically include your browser, OS, and app version.</p>
              </>
            ) : (
              <>
                <Field label="Is this related to a problem you're having?" value={feature.problem} onChange={v => setFeature(f => ({ ...f, problem: v }))} />
                <Field label="Describe the feature or integration you'd like" value={feature.solution} onChange={v => setFeature(f => ({ ...f, solution: v }))} required />
                <Field label="Alternatives you've considered" value={feature.alternatives} onChange={v => setFeature(f => ({ ...f, alternatives: v }))} />
                <Field label="Additional context" value={feature.context} onChange={v => setFeature(f => ({ ...f, context: v }))} />
              </>
            )}

            <button type="submit" disabled={submitting} className={`fb-submit ${kind === 'bug' ? 'bug' : 'feature'}`}>
              {submitting ? 'Sending…' : (kind === 'bug' ? 'Send bug report' : 'Send feature request')}
            </button>
          </form>

        </div>
      </div>
    </>
  );
}