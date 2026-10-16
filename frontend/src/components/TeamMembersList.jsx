import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Card } from './ui/Card';

export default function TeamMembersList() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/auth/users')
      .then(setMembers)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user || user.role !== 'admin') return null;

  const changeRole = async (id, role) => {
    setBusyId(id);
    try {
      await api.patch(`/auth/users/${id}`, { role });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (id, isActive) => {
    setBusyId(id);
    try {
      await api.patch(`/auth/users/${id}`, { is_active: !isActive });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteMember = async (id, username) => {
    if (!window.confirm(`Permanently delete ${username}'s account? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await api.del(`/auth/users/${id}`);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-3">Team members</h2>
      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const isSelf = m.id === user.id;
                const isLocked = m.is_owner && !isSelf;
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {m.username}
                      {isSelf && <span className="text-gray-400"> (you)</span>}
                      {m.is_owner && <span className="ml-2 text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">Owner</span>}
                    </td>
                    <td className="py-2 pr-4">{m.email}</td>
                    <td className="py-2 pr-4">
                      {isSelf || isLocked ? (
                        <span>{m.role}</span>
                      ) : (
                        <select
                          value={m.role}
                          disabled={busyId === m.id}
                          onChange={e => changeRole(m.id, e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          {user.is_owner && <option value="admin">Admin</option>}
                          <option value="user">User</option>
                          <option value="read_only">Read-only</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {isSelf || isLocked ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <button
                          onClick={() => toggleActive(m.id, m.is_active)}
                          disabled={busyId === m.id}
                          className={m.is_active ? 'text-green-600 hover:underline' : 'text-gray-400 hover:underline'}
                        >
                          {m.is_active ? 'Active' : 'Revoked'}
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {!isSelf && !isLocked && (
                        <button
                          onClick={() => deleteMember(m.id, m.username)}
                          disabled={busyId === m.id}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}