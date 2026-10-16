import { useState, useEffect } from 'react';

export default function AcceptInvite() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/invite-info?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { detail: text }; }
        if (!res.ok) throw new Error(data.detail || 'This invitation link is invalid or has expired.');
        setInfo(data);
      })
      .catch((err) => setInfoError(err.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username, password }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { detail: text }; }
      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map(d => d.msg || JSON.stringify(d)).join(' ')
          : data.detail;
        throw new Error(detail || 'Could not create your account');
      }
      setMessage({ type: 'ok', text: 'Account created successfully. You can now sign in.' });
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-900">Invalid invitation link</h1>
          <p className="text-sm text-gray-600">This link is missing its token. Please ask for a new invitation.</p>
          <a href="/login" className="text-teal-600 hover:underline text-sm">Go to sign in</a>
        </div>
      </div>
    );
  }

  if (infoError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-gray-900">Invitation not valid</h1>
          <p className="text-sm text-gray-600">{infoError}</p>
          <a href="/login" className="text-teal-600 hover:underline text-sm">Go to sign in</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-6 p-8">
        <h1 className="text-center text-2xl font-bold text-gray-900">Join InboxAir</h1>
        {info && (
          <p className="text-center text-sm text-gray-600">
            You've been invited to join <strong>{info.organization_name}</strong> as <strong>{info.email}</strong>
            {info.role ? ` (${info.role.replace('_', ' ')})` : ''}.
          </p>
        )}
        {message ? (
          <div className="space-y-4 text-center">
            <div className={`text-sm p-3 rounded-lg ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {message.text}
            </div>
            {message.type === 'ok' && (
              <a href="/login" className="text-teal-600 hover:underline text-sm">Go to sign in</a>
            )}
          </div>
        ) : (
          info && (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Choose a username</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Choose a password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-400 mt-1">At least 8 characters.</p>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}