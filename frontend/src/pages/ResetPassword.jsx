import { useState } from 'react';

const css = `
.rp-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--do-gold-bg);
  font-family: ui-sans-serif, system-ui, sans-serif;
  padding: 1.5rem;
}
.rp-card {
  width: 100%;
  max-width: 400px;
  background: var(--do-cream);
  border: 1.5px solid var(--do-border);
  border-radius: 16px;
  box-shadow: 0 4px 32px rgba(160,129,62,0.10), 0 1px 4px rgba(0,0,0,0.06);
  padding: 2.25rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.rp-wordmark {
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--do-text);
  margin: 0 0 0.1rem;
}
.rp-wordmark span { color: var(--do-gold-dark); }
.rp-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--do-text);
  text-align: center;
  margin: 0;
}
.rp-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--do-text-muted);
  margin-bottom: 0.3rem;
  font-family: ui-monospace, Consolas, monospace;
}
.rp-input {
  width: 100%;
  border: 1.5px solid var(--do-border);
  border-radius: 7px;
  padding: 0.6rem 0.75rem;
  font-size: 0.88rem;
  color: var(--do-text);
  background: var(--do-cream);
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rp-input:focus {
  border-color: var(--do-gold);
  box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
}
.rp-hint {
  font-size: 0.72rem;
  color: var(--do-text-muted);
  margin-top: 0.35rem;
  line-height: 1.45;
}
.rp-submit {
  width: 100%;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  background: var(--do-gold-dark);
  color: var(--on-gold);
  transition: background 0.15s, opacity 0.15s;
}
.rp-submit:hover:not(:disabled) { background: var(--do-gold); color: var(--on-gold); }
.rp-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.rp-msg {
  font-size: 0.82rem;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  text-align: center;
  line-height: 1.45;
}
.rp-msg.ok {
  background: rgba(22,163,74,0.07);
  border: 1px solid rgba(22,163,74,0.18);
  color: var(--success);
}
.rp-msg.err {
  background: rgba(220,38,38,0.06);
  border: 1px solid rgba(220,38,38,0.15);
  color: var(--danger);
}
.rp-link {
  display: block;
  text-align: center;
  font-size: 0.82rem;
  color: var(--do-gold-dark);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.rp-link:hover { color: var(--do-gold); }
`;

export default function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { detail: text }; }
      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map(d => d.msg || JSON.stringify(d)).join(' ')
          : data.detail;
        throw new Error(detail || 'Reset failed');
      }
      setMessage({ type: 'ok', text: data.detail || 'Password reset successfully.' });
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <>
        <style>{css}</style>
        <div className="rp-page">
          <div className="rp-card">
            <p className="rp-wordmark">Dev<span>Outreach</span></p>
            <h1 className="rp-title">Invalid reset link</h1>
            <p className="rp-msg err">This link is missing its token. Please request a new one.</p>
            <a href="/forgot-password" className="rp-link">Request a new reset link</a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="rp-page">
        <div className="rp-card">
          <p className="rp-wordmark">Dev<span>Outreach</span></p>
          <h1 className="rp-title">Set a new password</h1>

          {message ? (
            <>
              <p className={`rp-msg ${message.type}`}>{message.text}</p>
              {message.type === 'ok' && (
                <a href="/login" className="rp-link">Go to sign in →</a>
              )}
            </>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="rp-label">New password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="rp-input"
                  autoComplete="new-password"
                />
                <p className="rp-hint">At least 8 characters, with an uppercase letter, lowercase letter, and a digit.</p>
              </div>
              <button type="submit" disabled={submitting} className="rp-submit">
                {submitting ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}