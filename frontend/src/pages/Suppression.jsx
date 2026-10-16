import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';

const REASON_PILL = {
  unsubscribed: 'do-pill do-pill-gray',
  bounced:      'do-pill do-pill-red',
  manual:       'do-pill do-pill-blue',
};

export default function Suppression() {
  const notify = useNotify();
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  // rows just added locally; kept visible until the server list includes them
  const pendingRef = useRef([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const data = await api.get(`/suppression${qs}`);
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : (data && Array.isArray(data.entries) ? data.entries : []));
      const have = new Set(list.map(x => (x.email || '').toLowerCase()));
      pendingRef.current = pendingRef.current.filter(p => !have.has(p.email.toLowerCase()));
      const q = search.trim().toLowerCase();
      const extra = pendingRef.current.filter(p => !q || p.email.toLowerCase().includes(q));
      setEntries([...extra, ...list]);
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const addEntry = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    try {
      const email = newEmail.trim();
      const created = await api.post('/suppression', { email, reason: 'manual' });
      notify({ type: 'success', message: 'Added to suppression list' });
      setNewEmail('');
      // show the new row immediately; fall back to a reload if the API returned no row
      const row = (created && created.id && created.email)
        ? created
        : { id: `local-${Date.now()}`, email, reason: 'manual', created_at: new Date().toISOString() };
      pendingRef.current = [row, ...pendingRef.current.filter(p => p.email.toLowerCase() !== email.toLowerCase())];
      setEntries(prev => (prev.some(x => (x.email || '').toLowerCase() === email.toLowerCase()) ? prev : [row, ...prev]));
      setTimeout(load, 800);
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setAdding(false);
    }
  };

  const removeEntry = async (id) => {
    if (String(id).startsWith('local-')) {
      // row not yet confirmed by the server list: refresh to pick up its real id
      pendingRef.current = pendingRef.current.filter(p => p.id !== id);
      await load();
      return;
    }
    try {
      await api.del(`/suppression/${id}`);
      notify({ type: 'success', message: 'Removed' });
      load();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5" style={{ background: 'var(--do-bg)' }}>

      {/* ── Hero ── */}
      <div className="do-hero">
        <div className="do-hero-eyebrow">Deliverability · Safety</div>
        <div className="do-hero-title">Blocklist</div>
        <div className="do-hero-sub">
          Email addresses here are never enrolled in any campaign, org-wide. Automatically added when a lead
          unsubscribes or an email bounces — you can also add addresses manually.
        </div>

        {/* Add email inline in hero */}
        <form onSubmit={addEntry} style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="Add an email address…"
            style={{
              flex: '1 1 220px',
              background: 'var(--gold-dim)',
              border: '1px solid var(--border-active)',
              borderRadius: 'var(--do-r-full)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '7px 16px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            className="do-btn-hero"
            disabled={adding || !newEmail.trim()}
            style={adding || !newEmail.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </form>
      </div>

      {/* ── Search ── */}
      <div style={{ maxWidth: 380 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--do-text3)', marginBottom: 5 }}>
          Search
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search suppressed emails…"
          style={{
            width: '100%',
            background: 'var(--do-surface)',
            border: '1px solid var(--do-border-dark)',
            borderRadius: 'var(--do-r-sm)',
            color: 'var(--do-text)',
            fontSize: 13,
            padding: '8px 12px',
            outline: 'none',
          }}
        />
      </div>

      {/* ── Table / empty states ── */}
      {loading ? (
        <p style={{ color: 'var(--do-text4)', fontSize: 13 }}>Loading…</p>
      ) : entries.length === 0 ? (
        <div style={{
          background: 'var(--do-surface)',
          border: '1.5px dashed var(--do-border-dark)',
          borderRadius: 'var(--do-r-lg)',
          padding: '48px 24px',
          textAlign: 'center',
          color: 'var(--do-text4)',
          fontSize: 13,
        }}>
          No suppressed emails yet.
        </div>
      ) : (
        <div className="do-card" style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--do-border)',
            fontSize: 12,
            color: 'var(--do-text3)',
            fontWeight: 500,
          }}>
            {entries.length} suppressed address{entries.length !== 1 ? 'es' : ''}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="do-tbl">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Reason</th>
                  <th>Added</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="mono">{e.email}</td>
                    <td>
                      <span className={REASON_PILL[e.reason] || 'do-pill do-pill-gray'}>
                        {e.reason}
                      </span>
                    </td>
                    <td style={{ color: 'var(--do-text3)' }}>
                      {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => removeEntry(e.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--do-red)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: 'var(--do-r-xs)',
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}