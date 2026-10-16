import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

export default function InviteTeamMember() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  if (!user || user.role !== 'admin') return null;

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const data = await api.post('/auth/users/invite', { email, role });
      setMessage({ type: 'ok', text: data.detail || 'Invitation sent.' });
      setEmail('');
      setRole('user');
    } catch (err) {
      setMessage({ type: 'err', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Invite team member</h2>
      <p className="text-sm text-gray-500 mb-4">
        Send an invite by email. They'll set their own username and password.
      </p>
      <form onSubmit={submit} className="space-y-3 max-w-md">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="user">User (full access)</option>
            <option value="read_only">Read-only</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {message && (
          <div className={`text-sm p-2 rounded-lg ${message.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {message.text}
          </div>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send invite'}
        </Button>
      </form>
    </Card>
  );
}