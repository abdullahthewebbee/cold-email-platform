import { useState } from 'react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      setMessage({ type: 'ok', text: data.detail || 'If an account with that email exists, a reset link has been sent.' });
    } catch {
      setMessage({ type: 'err', text: 'Something went wrong. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-6 p-8">
        <div>
          <h1 className="text-center text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your account email and we'll send you a link to reset your password.
          </p>
        </div>

        {message ? (
          <div className={`text-sm text-center p-3 rounded-lg ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {message.text}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm">
          <a href="/login" className="text-teal-600 hover:underline">&larr; Back to sign in</a>
        </p>
      </div>
    </div>
  );
}