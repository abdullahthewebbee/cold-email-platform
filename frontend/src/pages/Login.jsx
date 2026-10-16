import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { setAccessToken } from '../context/AuthContext';

const BACKUP_MIN_PASSWORD_LEN = 8;

function parseDetailMessage(text) {
  try {
    const j = JSON.parse(text);
    const d = j.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d))
      return d.map(x => (typeof x === 'string' ? x : x.msg || JSON.stringify(x))).join(' ');
  } catch {
    /* ignore */
  }
  return text;
}

const css = `
/* ── Login / Sign-up: split layout (brand panel + form) ── */
.lo-page {
  height: 100vh;
  overflow-y: auto;   /* html/body don't scroll (see inboxair-density.css); bar hidden, wheel/touch still work */
  scrollbar-width: none;
  display: grid;
  grid-template-columns: minmax(300px, 42%) 1fr;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
}

/* left brand panel */
.lo-page::-webkit-scrollbar { display: none; }
.lo-side {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 28px 40px 24px;
  background:
    radial-gradient(70% 55% at 15% 85%, var(--gold-dim), transparent 70%),
    repeating-linear-gradient(135deg, transparent 0 56px, var(--gold-hover) 56px 57px),
    var(--bg-surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
}
.lo-side-logo {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--gold-dark);
  letter-spacing: -0.01em;
  text-decoration: none;
}
.lo-side-copy { max-width: 420px; }
.lo-eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold-dark);
  margin: 0 0 10px;
}
.lo-side-title {
  font-family: var(--font-display);
  font-size: 38px;
  line-height: 1.12;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 14px;
  letter-spacing: -0.01em;
}
.lo-side-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
  margin: 0;
}
.lo-side-foot { font-size: 12px; color: var(--text-dim); }
.lo-side-foot a { color: var(--text-muted); text-decoration: underline; text-underline-offset: 2px; }
.lo-side-foot a:hover { color: var(--gold-dark); }
.lo-side-foot .lo-dot { margin: 0 6px; }

/* right: form column */
.lo-main {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 24px;
  background: var(--bg);
}
.lo-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lo-mobile-logo {
  display: none;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--gold-dark);
  margin: 0 0 4px;
}
.lo-head { margin-bottom: 4px; }
.lo-title {
  font-family: var(--font-display);
  font-size: 26px;
  line-height: 1.15;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 6px;
}
.lo-sub { font-size: 13.5px; color: var(--text-muted); margin: 0; line-height: 1.5; }

/* form */
.lo-pw-form { display: flex; flex-direction: column; gap: 10px; }
.lo-label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.lo-label-row { display: flex; align-items: baseline; justify-content: space-between; }
.lo-label-row .lo-label { margin-bottom: 4px; }
.lo-input {
  width: 100%;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 13.5px;
  color: var(--text);
  background: var(--bg-input);
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.lo-input::placeholder { color: var(--text-dim); }
.lo-input:focus { border-color: var(--gold-dark); box-shadow: 0 0 0 3px var(--gold-dim); }
.lo-pw-wrap { position: relative; }
.lo-pw-wrap .lo-input { padding-right: 40px; }
.lo-eye {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  width: 32px; height: 32px; border: 0; background: none; cursor: pointer;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center; border-radius: 8px;
}
.lo-eye:hover { color: var(--gold-dark); background: var(--gold-hover); }
.lo-forgot { font-size: 12.5px; }
.lo-forgot a { color: var(--gold-dark); text-decoration: none; font-weight: 500; }
.lo-forgot a:hover { text-decoration: underline; }

.lo-pw-error {
  font-size: 12.5px;
  color: var(--danger);
  padding: 8px 10px;
  background: var(--danger-dim);
  border: 1px solid var(--danger-line);
  border-radius: 8px;
  margin: 0;
}

.lo-submit-btn {
  width: 100%;
  height: 40px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: var(--gold-dark);
  color: var(--on-gold);
  margin-top: 2px;
  transition: background 0.15s, opacity 0.15s, transform 0.1s;
}
.lo-submit-btn:hover:not(:disabled) { background: var(--gold-light); }
.lo-submit-btn:active:not(:disabled) { transform: scale(0.99); }
.lo-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* divider */
.lo-divider {
  display: flex; align-items: center; gap: 12px;
  color: var(--text-dim); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
}
.lo-divider::before, .lo-divider::after { content: ''; flex: 1; border-top: 1px solid var(--border); }

/* OAuth buttons: Google + Microsoft */
.lo-oauth-stack { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.lo-oauth-stack.stacked { grid-template-columns: 1fr; }
.lo-oauth-btn {
  width: 100%;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  height: 38px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  text-decoration: none;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}
.lo-oauth-btn:hover { border-color: var(--border-active); background: var(--gold-hover); }
.lo-oauth-btn:active { transform: scale(0.99); }
.lo-oauth-btn svg { flex-shrink: 0; }

/* switch sign in / sign up */
.lo-switch { text-align: center; font-size: 13px; color: var(--text-muted); margin: 2px 0 0; }
.lo-switch button {
  background: none; border: 0; padding: 0; cursor: pointer;
  font-size: 13px; font-weight: 600; color: var(--gold-dark);
}
.lo-switch button:hover { text-decoration: underline; }

/* legal / first-user footer */
.lo-legal { font-size: 12px; text-align: center; color: var(--text-muted); line-height: 1.5; margin: 0; }
.lo-legal a { color: var(--gold-dark); text-decoration: underline; text-underline-offset: 2px; }
.lo-admin-note { text-align: center; font-size: 12.5px; color: var(--text-muted); margin: 0; }

@media (max-height: 640px) {
  .lo-main { padding-top: 10px; padding-bottom: 10px; }
  .lo-card { gap: 8px; }
  .lo-pw-form { gap: 8px; }
  .lo-sub { font-size: 12.5px; }
  .lo-title { font-size: 23px; }
}
@media (max-width: 860px) {
  .lo-page { grid-template-columns: 1fr; }
  .lo-side { display: none; }
  .lo-mobile-logo { display: block; }
  .lo-main { align-items: flex-start; padding-top: 40px; }
}

/* ── Restore wizard ── */
.lo-restore-section {
  padding-top: 1.25rem;
  border-top: 1px solid var(--do-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.lo-restore-link-row {
  text-align: center;
}
.lo-restore-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--do-gold-dark);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lo-restore-link:hover { color: var(--do-gold); }
.lo-restore-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.lo-restore-title {
  font-family: var(--font-display);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--do-text);
  margin: 0;
}
.lo-restore-hide {
  background: none;
  border: none;
  font-size: 0.75rem;
  color: var(--do-text-muted);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lo-restore-warn {
  font-size: 0.73rem;
  line-height: 1.55;
  color: var(--warning);
  background: rgba(217,119,6,0.07);
  border: 1px solid rgba(217,119,6,0.2);
  border-radius: 7px;
  padding: 0.5rem 0.75rem;
}
.lo-restore-warn code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.7rem;
}
.lo-file-row {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}
.lo-file-clear {
  flex-shrink: 0;
  padding: 0 0.75rem;
  border-radius: 7px;
  border: 1.5px solid var(--do-border);
  background: var(--bg-elevated);
  font-size: 1rem;
  font-weight: 700;
  color: var(--do-text-muted);
  cursor: pointer;
  line-height: 1;
  transition: border-color 0.15s;
}
.lo-file-clear:hover { border-color: var(--danger); color: var(--danger); }
.lo-reading {
  text-align: center;
  font-size: 0.75rem;
  color: var(--do-text-muted);
  font-family: ui-monospace, Consolas, monospace;
}

/* meta + preview info boxes */
.lo-meta-box, .lo-preview-box {
  border: 1.5px solid var(--do-border);
  border-radius: 8px;
  background: var(--do-cream);
  padding: 0.85rem;
  font-size: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lo-meta-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
@media (max-width: 440px) { .lo-meta-cols { grid-template-columns: 1fr; } }
.lo-meta-col-title {
  font-weight: 700;
  color: var(--do-text);
  margin-bottom: 0.2rem;
}
.lo-meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  color: var(--do-text-muted);
  line-height: 1.6;
}
.lo-meta-divider {
  border: none;
  border-top: 1px solid var(--do-border);
  margin: 0;
}
.lo-meta-hint {
  color: var(--do-text-muted);
  font-family: ui-monospace, Consolas, monospace;
}
.lo-meta-caution {
  font-size: 0.72rem;
  color: var(--warning);
  padding-top: 0.4rem;
  border-top: 1px solid rgba(217,119,6,0.15);
}

/* secondary action button */
.lo-verify-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1.5px solid var(--do-border);
  background: var(--do-cream);
  color: var(--do-text);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.lo-verify-btn:hover:not(:disabled) {
  border-color: var(--do-gold);
  background: var(--do-gold-bg, rgba(201,168,76,0.06));
}
.lo-verify-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* confirmed restore button */
.lo-confirm-btn {
  width: 100%;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  background: var(--bg-elevated);
  color: var(--do-gold);
  transition: background 0.15s, opacity 0.15s;
}
.lo-confirm-btn:hover:not(:disabled) { background: var(--bg-input); }
.lo-confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* restore message */
.lo-restore-msg {
  text-align: center;
  font-size: 0.78rem;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
}
.lo-restore-msg.ok {
  color: var(--success);
  background: rgba(22,163,74,0.07);
  border: 1px solid rgba(22,163,74,0.15);
}
.lo-restore-msg.err {
  color: var(--danger);
  background: rgba(220,38,38,0.06);
  border: 1px solid rgba(220,38,38,0.15);
}
`;

export default function Login() {
  const { setupComplete, refreshToken } = useAuth();
  const [pwMode, setPwMode] = useState('login');
  const [pwUsername, setPwUsername] = useState('');
  const [pwEmail, setPwEmail] = useState('');
  const [pwPassword, setPwPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [restoreExpanded, setRestoreExpanded] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreFileKey, setRestoreFileKey] = useState(0);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreMeta, setRestoreMeta] = useState(null);
  const [restoreMetaBusy, setRestoreMetaBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restorePreviewBusy, setRestorePreviewBusy] = useState(false);
  const [restoreExecuteBusy, setRestoreExecuteBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState(null);

  const isFirstUser = setupComplete === false;

  useEffect(() => {
    if (!isFirstUser || !restoreExpanded || !restoreFile) {
      return undefined;
    }
    let cancelled = false;
    setRestoreMetaBusy(true);
    setRestoreMeta(null);
    setRestorePreview(null);
    setRestoreMsg(null);
    (async () => {
      try {
        const form = new FormData();
        form.append('file', restoreFile);
        const res = await fetch('/api/auth/restore-setup/metadata', { method: 'POST', body: form });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { detail: text || res.statusText }; }
        if (!res.ok) throw new Error(parseDetailMessage(text) || res.statusText);
        if (!cancelled) setRestoreMeta(data);
      } catch (e) {
        if (!cancelled) setRestoreMsg({ type: 'err', text: e.message || 'Could not read backup file' });
      } finally {
        if (!cancelled) setRestoreMetaBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isFirstUser, restoreExpanded, restoreFile]);

  const submitPasswordForm = async (e) => {
    e.preventDefault();
    setPwError(null);
    setPwSubmitting(true);
    try {
      if (isFirstUser || pwMode === 'signup') {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: pwUsername, email: pwEmail, password: pwPassword }),
        });
        if (!regRes.ok) {
          const text = await regRes.text();
          throw new Error(parseDetailMessage(text) || 'Registration failed');
        }
      }
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pwUsername, password: pwPassword }),
      });
      const loginText = await loginRes.text();
      if (!loginRes.ok) throw new Error(parseDetailMessage(loginText) || 'Login failed');
      const loginData = JSON.parse(loginText);
      setAccessToken(loginData.access_token);
      await refreshToken();
    } catch (err) {
      setPwError(err.message || 'Something went wrong');
    } finally {
      setPwSubmitting(false);
    }
  };

  const clearRestoreWizard = () => {
    setRestoreFile(null);
    setRestoreFileKey(k => k + 1);
    setRestorePassword('');
    setRestoreMeta(null);
    setRestorePreview(null);
    setRestoreMsg(null);
  };

  const isSignup = isFirstUser || pwMode === 'signup';
  const eyebrow = isFirstUser ? 'First-time setup' : isSignup ? 'Get started' : 'Secure sign in';
  const heading = isFirstUser ? 'Create your admin account' : isSignup ? 'Create your account' : 'Sign in to InboxAir';
  const subheading = isFirstUser
    ? 'Set up your workspace. The first account becomes the admin.'
    : isSignup
      ? 'Fill in the details below to create your account.'
      : 'Enter your credentials to access your dashboard.';
  const googleLabel = isFirstUser ? 'Create admin account with Google' : isSignup ? 'Sign up with Google' : 'Sign in with Google';
  const microsoftLabel = isFirstUser ? 'Create admin account with Microsoft' : isSignup ? 'Sign up with Microsoft' : 'Sign in with Microsoft';
  const [showPw, setShowPw] = useState(false);

  return (
    <>
      <style>{css}</style>
      <div className="lo-page">

        {/* ── Brand panel ── */}
        <aside className="lo-side">
          <div className="lo-side-logo">InboxAir</div>
          <div className="lo-side-copy">
            <p className="lo-eyebrow">{isSignup ? 'Get started' : 'Welcome back'}</p>
            <h2 className="lo-side-title">Your outreach, delivered.</h2>
            <p className="lo-side-text">
              {isSignup
                ? 'Create your account to manage campaigns, contacts and inboxes in one place.'
                : 'Sign in to manage your campaigns, contacts and inboxes, and keep your sending healthy.'}
            </p>
          </div>
          <div className="lo-side-foot">
            © {new Date().getFullYear()} InboxAir
            <span className="lo-dot">·</span>
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>
            <span className="lo-dot">·</span>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
          </div>
        </aside>

        {/* ── Form ── */}
        <main className="lo-main">
        <div className="lo-card">

          <div className="lo-mobile-logo">InboxAir</div>
          <div className="lo-head">
            <p className="lo-eyebrow">{eyebrow}</p>
            <h1 className="lo-title">{heading}</h1>
            <p className="lo-sub">{subheading}</p>
          </div>

          {/* ── Password form ── */}
          <form onSubmit={submitPasswordForm} className="lo-pw-form">
            {pwError && <p className="lo-pw-error">{pwError}</p>}
            <div>
              <label className="lo-label">Username</label>
              <input
                type="text"
                required
                value={pwUsername}
                onChange={e => setPwUsername(e.target.value)}
                className="lo-input"
                placeholder="Your username"
                autoComplete="username"
              />
            </div>
            {isSignup && (
              <div>
                <label className="lo-label">Email address</label>
                <input
                  type="email"
                  required
                  value={pwEmail}
                  onChange={e => setPwEmail(e.target.value)}
                  className="lo-input"
                  placeholder="your@email.com"
                  autoComplete="email"
                />
              </div>
            )}
            <div>
              <div className="lo-label-row">
                <label className="lo-label">Password</label>
                {!isFirstUser && pwMode === 'login' && (
                  <span className="lo-forgot"><a href="/forgot-password">Forgot password?</a></span>
                )}
              </div>
              <div className="lo-pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={pwPassword}
                  onChange={e => setPwPassword(e.target.value)}
                  className="lo-input"
                  placeholder="Enter your password"
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                />
                <button type="button" className="lo-eye" onClick={() => setShowPw(v => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showPw
                      ? <><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                  </svg>
                </button>
              </div>
            </div>
            <button type="submit" disabled={pwSubmitting} className="lo-submit-btn">
              {pwSubmitting
                ? 'Please wait…'
                : isSignup
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>

          {/* ── OAuth ── */}
          <div className="lo-divider">or</div>
          <div className={`lo-oauth-stack${isFirstUser ? ' stacked' : ''}`}>
            <a href="/oauth/app/google/authorize" className="lo-oauth-btn lo-oauth-btn-google">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {googleLabel}
            </a>
            <a href="/oauth/app/microsoft/authorize" className="lo-oauth-btn lo-oauth-btn-microsoft">
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
                <rect fill="#F25022" x="1" y="1" width="9" height="9"/>
                <rect fill="#7FBA00" x="11" y="1" width="9" height="9"/>
                <rect fill="#00A4EF" x="1" y="11" width="9" height="9"/>
                <rect fill="#FFB900" x="11" y="11" width="9" height="9"/>
              </svg>
              {microsoftLabel}
            </a>
          </div>

          {/* ── Switch sign in / sign up ── */}
          {!isFirstUser && (
            <p className="lo-switch">
              {pwMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button type="button" onClick={() => { setPwError(null); setPwMode(pwMode === 'login' ? 'signup' : 'login'); }}>
                {pwMode === 'login' ? 'Create Account' : 'Sign in'}
              </button>
            </p>
          )}

          {/* ── First-user extras ── */}
          {isFirstUser && (
            <>
              <p className="lo-legal">
                By continuing, you agree to our{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </p>
              <p className="lo-admin-note">The first account created becomes the admin.</p>

              {/* ── Restore wizard ── */}
              <div className="lo-restore-section">
                {!restoreExpanded ? (
                  <div className="lo-restore-link-row">
                    <button type="button" className="lo-restore-link" onClick={() => setRestoreExpanded(true)}>
                      Want to restore from a backup?
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="lo-restore-header">
                      <p className="lo-restore-title">Restore from backup</p>
                      <button
                        type="button"
                        className="lo-restore-hide"
                        onClick={() => { setRestoreExpanded(false); clearRestoreWizard(); }}
                      >
                        Hide
                      </button>
                    </div>

                    <p className="lo-restore-warn">
                      Use a InboxAir backup file (<code>.qbk</code>). If the backup is encrypted, you need
                      the password — losing it means the data in that file is unrecoverable. The optional hint
                      is stored in plain text in the file.
                    </p>

                    <div className="lo-file-row">
                      <FileUploadArea
                        key={restoreFileKey}
                        size="full"
                        style={{ flex: 1, minWidth: 0, fontSize: '0.78rem' }}
                        accept=".qbk,application/octet-stream"
                        disabled={restoreMetaBusy || restorePreviewBusy || restoreExecuteBusy}
                        onChange={e => {
                          setRestoreMsg(null);
                          setRestorePreview(null);
                          setRestoreMeta(null);
                          setRestoreFile(e.target.files?.[0] || null);
                        }}
                      >
                        {restoreFile
                          ? <span style={{ wordBreak: 'break-all' }}>{restoreFile.name}</span>
                          : <span style={{ color: 'var(--do-text-muted)' }}>Choose backup file (.qbk)</span>}
                      </FileUploadArea>
                      {restoreFile && (
                        <button
                          type="button"
                          title="Remove file"
                          className="lo-file-clear"
                          onClick={clearRestoreWizard}
                          disabled={restoreMetaBusy || restorePreviewBusy || restoreExecuteBusy}
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {restoreMetaBusy && <p className="lo-reading">Reading backup…</p>}

                    {restoreMeta && !restoreMetaBusy && (
                      <div className="lo-meta-box">
                        <div className="lo-meta-cols">
                          <div>
                            <p className="lo-meta-col-title">This backup</p>
                            <ul className="lo-meta-list">
                              <li>When: {restoreMeta.backup_preview?.backed_up_at ? new Date(restoreMeta.backup_preview.backed_up_at).toLocaleString() : '—'}</li>
                              <li>Leads: {restoreMeta.backup_preview?.lead_count ?? '—'}</li>
                              <li>Inboxes: {restoreMeta.backup_preview?.inbox_count ?? '—'}</li>
                              <li>Campaigns: {restoreMeta.backup_preview?.campaign_count ?? '—'}</li>
                              <li>Users: {restoreMeta.backup_preview?.user_count ?? '—'}</li>
                              <li>Admins: {(restoreMeta.backup_preview?.admin_emails || []).join(', ') || '—'}</li>
                              <li>Encrypted: {restoreMeta.encrypted ? 'yes' : 'no'}</li>
                            </ul>
                          </div>
                          <div>
                            <p className="lo-meta-col-title">Current DB (will be replaced)</p>
                            <ul className="lo-meta-list">
                              <li>Leads: {restoreMeta.current_database?.lead_count ?? '—'}</li>
                              <li>Inboxes: {restoreMeta.current_database?.inbox_count ?? '—'}</li>
                              <li>Campaigns: {restoreMeta.current_database?.campaign_count ?? '—'}</li>
                              <li>Users: {restoreMeta.current_database?.user_count ?? '—'}</li>
                              <li>Admins: {(restoreMeta.current_database?.admin_emails || []).join(', ') || '—'}</li>
                            </ul>
                          </div>
                        </div>
                        {restoreMeta.password_hint && (
                          <>
                            <hr className="lo-meta-divider" />
                            <p className="lo-meta-hint">Hint: {restoreMeta.password_hint}</p>
                          </>
                        )}
                        <p className="lo-meta-caution">Confirm only if this is the correct backup.</p>
                      </div>
                    )}

                    {restoreMeta && !restorePreview && !restoreMeta.encrypted && (
                      <button
                        type="button"
                        disabled={restorePreviewBusy || restoreMetaBusy}
                        className="lo-verify-btn"
                        onClick={async () => {
                          if (!restoreFile) return;
                          setRestorePreviewBusy(true);
                          setRestoreMsg(null);
                          setRestorePreview(null);
                          try {
                            const form = new FormData();
                            form.append('file', restoreFile);
                            const res = await fetch('/api/auth/restore-setup/preview', { method: 'POST', body: form });
                            const text = await res.text();
                            let data;
                            try { data = JSON.parse(text); } catch { data = { detail: text || res.statusText }; }
                            if (!res.ok) throw new Error(parseDetailMessage(text) || res.statusText);
                            setRestorePreview(data);
                          } catch (e) {
                            setRestoreMsg({ type: 'err', text: e.message || 'Could not verify backup' });
                          } finally {
                            setRestorePreviewBusy(false);
                          }
                        }}
                      >
                        {restorePreviewBusy ? 'Checking…' : 'Verify backup'}
                      </button>
                    )}

                    {restoreMeta && restoreMeta.encrypted && !restorePreview && (
                      <>
                        <div>
                          <label className="lo-label">Backup password</label>
                          <input
                            type="password"
                            placeholder={`At least ${BACKUP_MIN_PASSWORD_LEN} characters`}
                            className="lo-input"
                            value={restorePassword}
                            onChange={e => setRestorePassword(e.target.value)}
                            disabled={restorePreviewBusy || restoreExecuteBusy}
                            autoComplete="off"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={restorePreviewBusy || !restoreFile || restorePassword.length < BACKUP_MIN_PASSWORD_LEN}
                          className="lo-verify-btn"
                          onClick={async () => {
                            if (!restoreFile) return;
                            setRestorePreviewBusy(true);
                            setRestoreMsg(null);
                            setRestorePreview(null);
                            try {
                              const form = new FormData();
                              form.append('file', restoreFile);
                              form.append('password', restorePassword);
                              const res = await fetch('/api/auth/restore-setup/preview', { method: 'POST', body: form });
                              const text = await res.text();
                              let data;
                              try { data = JSON.parse(text); } catch { data = { detail: text || res.statusText }; }
                              if (!res.ok) throw new Error(parseDetailMessage(text) || res.statusText);
                              setRestorePreview(data);
                            } catch (e) {
                              setRestoreMsg({ type: 'err', text: e.message || 'Wrong password or invalid backup' });
                            } finally {
                              setRestorePreviewBusy(false);
                            }
                          }}
                        >
                          {restorePreviewBusy ? 'Checking…' : 'Verify password'}
                        </button>
                      </>
                    )}

                    {restorePreview && (
                      <div className="lo-preview-box">
                        <p className="lo-meta-col-title">Verified — full details</p>
                        <ul className="lo-meta-list">
                          <li>When: {restorePreview.backup?.backed_up_at ? new Date(restorePreview.backup.backed_up_at).toLocaleString() : '—'}</li>
                          <li>Leads: {restorePreview.backup?.lead_count ?? '—'}</li>
                          <li>Inboxes: {restorePreview.backup?.inbox_count ?? '—'}</li>
                          <li>Campaigns: {restorePreview.backup?.campaign_count ?? '—'}</li>
                          <li>Users: {restorePreview.backup?.user_count ?? '—'}</li>
                          <li>Admins: {(restorePreview.backup?.admin_emails || []).join(', ') || '—'}</li>
                        </ul>
                        <button
                          type="button"
                          disabled={restoreExecuteBusy}
                          className="lo-confirm-btn"
                          onClick={async () => {
                            if (!window.confirm('Replace the database with this backup? This cannot be undone.')) return;
                            setRestoreExecuteBusy(true);
                            setRestoreMsg(null);
                            try {
                              const res = await fetch('/api/auth/restore-setup/execute', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ restore_token: restorePreview.restore_token }),
                              });
                              const text = await res.text();
                              let data;
                              try { data = JSON.parse(text); } catch { data = { detail: text || res.statusText }; }
                              if (!res.ok) throw new Error(parseDetailMessage(text) || res.statusText);
                              setRestoreMsg({ type: 'ok', text: data.detail || 'Restore complete. Reloading…' });
                              setRestorePreview(null);
                              if ((res.headers.get('X-InboxAir-Reload') || res.headers.get('X-DevOutreach-Reload') || res.headers.get('X-Emissary-Reload')) === '1') {
                                setTimeout(() => window.location.reload(), 300);
                              }
                            } catch (e) {
                              setRestoreMsg({ type: 'err', text: e.message || 'Restore failed' });
                            } finally {
                              setRestoreExecuteBusy(false);
                            }
                          }}
                        >
                          {restoreExecuteBusy ? 'Restoring…' : 'Confirm and restore'}
                        </button>
                      </div>
                    )}

                    {restoreMsg && (
                      <p className={`lo-restore-msg ${restoreMsg.type}`}>{restoreMsg.text}</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}

        </div>
        </main>
      </div>
    </>
  );
}