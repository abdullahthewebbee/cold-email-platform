import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { Input } from '../components/ui/Input';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useLoading } from '../context/LoadingContext';
import { cn } from '../utils/cn';
import { useSubscription } from '../hooks/useSubscription';
import Icon from '../components/ui/AegisIcon';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'completed', label: 'Completed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'wrong_person', label: 'Wrong person' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'replied', label: 'Replied' },
];

const INTEREST_FILTER_OPTIONS = [
  { value: 'all', label: 'All interest' },
  { value: 'unset', label: 'No interest set' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'out_of_office', label: 'Out of office' },
  { value: 'auto_reply', label: 'Auto-reply' },
];

const TAB_ALL = 'all';
const TAB_BOUNCED = 'bounced';

function formatEnrolled(campaigns) {
  if (!campaigns?.length) return '—';
  const dates = campaigns.map((c) => new Date(c.enrolled_at).getTime()).filter(Number.isFinite);
  if (!dates.length) return '—';
  const earliest = new Date(Math.min(...dates));
  return earliest.toLocaleDateString();
}

function statusPillClass(status) {
  switch (status) {
    case 'active':
    case 'contacted':
      return 'do-pill do-pill-green';
    case 'completed':
      return 'do-pill do-pill-blue';
    case 'unsubscribed':
    case 'wrong_person':
      return 'do-pill do-pill-gray';
    case 'bounced':
    case 'invalid':
      return 'do-pill do-pill-red';
    default:
      return 'do-pill do-pill-gray';
  }
}

function buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter }) {
  const params = new URLSearchParams();
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (tab === TAB_BOUNCED) {
    params.set('bad_only', 'true');
  }
  if (tab === TAB_ALL && statusFilter !== 'all') {
    params.set('status', statusFilter);
  }
  if (interestFilter && interestFilter !== 'all') {
    params.set('interest', interestFilter);
  }
  return params;
}

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === TAB_BOUNCED ? TAB_BOUNCED : TAB_ALL;

  const setTab = (next) => {
    const p = new URLSearchParams(searchParams);
    if (next === TAB_ALL) p.delete('tab');
    else p.set('tab', next);
    setSearchParams(p);
  };

  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [interestFilter, setInterestFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [emailDrafts, setEmailDrafts] = useState({});
  const [bulkEnrollmentStatus, setBulkEnrollmentStatus] = useState('active');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const notify = useNotify();
  const confirm = useConfirm();
  const loading = useLoading();
  const { isActive } = useSubscription();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadLeads = useCallback(async () => {
    loading.start();
    try {
      const params = buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter });
      const qs = params.toString();
      const data = await api.get('/leads' + (qs ? `?${qs}` : ''));
      const rows = Array.isArray(data) ? data : [];
      setLeads(rows);
      setSelected(new Set());
      setEmailDrafts((prev) => {
        const next = { ...prev };
        rows.forEach((l) => {
          if (next[l.id] === undefined) next[l.id] = l.email;
        });
        return next;
      });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Failed to load leads' });
    } finally {
      loading.stop();
    }
  }, [debouncedSearch, statusFilter, interestFilter, tab, loading, notify]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const visibleIds = useMemo(() => leads.map((l) => l.id), [leads]);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === visibleIds.length && visibleIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    const ok = await confirm(
      `Permanently delete ${selected.size} lead(s)? This removes enrollments and email history for those leads.`,
    );
    if (!ok) return;
    loading.start();
    try {
      const res = await api.post('/leads/bulk-delete', { lead_ids: [...selected] });
      const n = res.deleted ?? selected.size;
      notify({ type: 'success', message: `Deleted ${n} lead(s).` });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Delete failed' });
    } finally {
      loading.stop();
    }
  };

  const handleBulkStatus = async () => {
    if (!selected.size) return;
    const ok = await confirm(
      `Set enrollment to "${bulkEnrollmentStatus}" on every campaign for ${selected.size} lead(s)? The send queue will be recalculated.`,
    );
    if (!ok) return;
    loading.start();
    try {
      await api.post('/leads/bulk-status', { lead_ids: [...selected], enrollment_status: bulkEnrollmentStatus });
      notify({ type: 'success', message: 'Status updated.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Update failed' });
    } finally {
      loading.stop();
    }
  };

  const handleBulkReenroll = async () => {
    const ids = [...selected];
    const targets = ids
      .map((id) => leads.find((l) => l.id === id))
      .filter(Boolean)
      .filter(
        (l) =>
          l.email_verification_status === 'invalid' ||
          (l.campaigns || []).some((c) => c.status === 'bounced'),
      );
    if (!targets.length) {
      notify({ type: 'info', message: 'Select bounced or invalid leads to re-enroll with a corrected email.' });
      return;
    }
    const ok = await confirm(
      `Re-enroll ${targets.length} lead(s) using the "New email" values? Status becomes active; verification runs when enabled on your account.`,
    );
    if (!ok) return;
    loading.start();
    try {
      const items = targets
        .map((l) => ({
          lead_id: l.id,
          email: (emailDrafts[l.id] ?? l.email).trim(),
        }))
        .filter((row) => row.email);
      if (!items.length) {
        notify({ type: 'error', message: 'Enter an email for each selected lead.' });
        return;
      }
      const res = await api.post('/leads/bulk-recover', { items, verify_email: true });
      const n = res.recovered ?? 0;
      const errN = res.errors?.length ?? 0;
      notify({
        type: errN ? 'info' : 'success',
        message: `Recovery started for ${n} lead(s).${errN ? ` ${errN} skipped (see API errors).` : ''}`,
      });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Re-enroll failed' });
    } finally {
      loading.stop();
    }
  };

  const recoverOne = async (lead) => {
    const email = (emailDrafts[lead.id] ?? lead.email).trim();
    if (!email) {
      notify({ type: 'error', message: 'Enter an email address.' });
      return;
    }
    loading.start();
    try {
      await api.post(`/leads/${lead.id}/recover`, { email, verify_email: true });
      notify({ type: 'success', message: 'Lead updated. Verification or scheduling will follow your account settings.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Recovery failed' });
    } finally {
      loading.stop();
    }
  };

  const markActiveOne = async (lead) => {
    loading.start();
    try {
      await api.patch(`/leads/${lead.id}`, { enrollment_status: 'active' });
      notify({ type: 'success', message: 'All enrollments set to active; queue recalculated.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Update failed' });
    } finally {
      loading.stop();
    }
  };

  const exportCsv = async () => {
    const params = buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter });
    const qs = params.toString();
    loading.start();
    try {
      const res = await api.download('/leads/export' + (qs ? `?${qs}` : ''));
      const blob = await res.blob();
      let filename = tab === TAB_BOUNCED ? 'leads-bounced-invalid.csv' : 'leads-export.csv';
      const cd = res.headers.get('content-disposition');
      if (cd) {
        const m = cd.match(/filename="?([^";\n]+)"?/i);
        if (m?.[1]) filename = m[1].trim();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify({ type: 'success', message: 'CSV downloaded.' });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Export failed' });
    } finally {
      loading.stop();
    }
  };

  const importRecoverCsv = async (file) => {
    const ok = await confirm(
      'Recover leads from this CSV? The server reads id and email columns (header row or first two columns).',
    );
    if (!ok) return;
    loading.start();
    try {
      const res = await api.upload('/leads/recover-import?verify_emails=true', file);
      const n = res.recovered ?? 0;
      const errN = res.errors?.length ?? 0;
      notify({
        type: errN ? 'info' : 'success',
        message: `Recovered ${n} lead(s).${errN ? ` ${errN} row(s) skipped.` : ''}`,
      });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Import failed — check CSV format and IDs.' });
      await loadLeads();
    } finally {
      loading.stop();
    }
  };

  const colSpan = tab === TAB_BOUNCED ? 9 : 7;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5" style={{ background: 'var(--do-bg)' }}>

      {/* ── Hero ── */}
      <div className="do-hero">
        <div className="do-hero-eyebrow">Contacts · Leads</div>
        <div className="do-hero-title">Lead Management</div>
        <div className="do-hero-sub">
          Search and manage contacts across campaigns. Use <strong style={{ opacity: 1 }}>Bounced &amp; Invalid</strong> to fix
          addresses and put people back into the send flow.
        </div>
        <div className="do-hero-actions">
          <button
            className="do-btn-hero"
            onClick={exportCsv}
            disabled={!leads.length}
            style={!leads.length ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            ↓ Export CSV
          </button>

          {!isActive && (
            <span style={{
              background: 'rgba(255,200,50,.18)',
              border: '1px solid rgba(255,200,50,.4)',
              color: 'var(--warning)',
              borderRadius: 'var(--do-r-full)',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 14px',
            }}>
              <Icon name="alert-triangle" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Upgrade to import leads
            </span>
          )}

          <fieldset disabled={!isActive} style={{ border: 'none', padding: 0, margin: 0, ...(!isActive ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--gold-dim)',
              color: 'var(--text)',
              padding: '8px 18px',
              borderRadius: 'var(--do-r-full)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}>
              ↑ Import recovery CSV
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) importRecoverCsv(f);
                }}
              />
            </label>
          </fieldset>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {[
          { value: TAB_ALL, label: 'All Leads' },
          { value: TAB_BOUNCED, label: 'Bounced & Invalid' },
        ].map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            style={{
              borderRadius: 'var(--do-r-full)',
              border: tab === t.value ? '1.5px solid var(--do-gold-dark)' : '1px solid var(--do-border-dark)',
              background: tab === t.value ? 'var(--do-gold-dark)' : 'var(--do-surface)',
              color: tab === t.value ? 'var(--on-gold)' : 'var(--do-text2)',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 16px',
              cursor: 'pointer',
              transition: 'all .15s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Status filter pills (All tab) ── */}
      {tab === TAB_ALL && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--do-text3)', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', marginRight: 4 }}>Status</span>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatusFilter(o.value)}
              className="do-preset-pill"
              style={statusFilter === o.value ? {
                background: 'var(--do-gold-dark)',
                borderColor: 'var(--do-gold-dark)',
                color: 'var(--on-gold)',
              } : {}}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Interest filter pills ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--do-text3)', fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', marginRight: 4 }}>Interest</span>
        {INTEREST_FILTER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setInterestFilter(o.value)}
            className="do-preset-pill"
            style={interestFilter === o.value ? {
              background: 'var(--do-gold-dark)',
              borderColor: 'var(--do-gold-dark)',
              color: 'var(--on-gold)',
            } : {}}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* ── Bounced tip card ── */}
      {tab === TAB_BOUNCED && (
        <div style={{
          background: 'var(--do-orange-light)',
          border: '1px solid var(--do-orange)',
          borderRadius: 'var(--do-r)',
          padding: '12px 16px',
          fontSize: 13,
          color: 'var(--do-text2)',
          lineHeight: 1.6,
        }}>
          Edit the email for each row, then <strong>Save &amp; recover</strong>. That updates the lead record (all campaigns),
          sets status to active, and either queues verification or reschedules immediately.
          Export bad addresses to clean them elsewhere, then import a CSV with columns <code style={{ fontFamily: 'var(--do-font-mono)', fontSize: 11 }}>id,email</code>.
        </div>
      )}

      {/* ── Search ── */}
      <div style={{ maxWidth: 380 }}>
        <Input
          label="Search"
          placeholder="Email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="do-card" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>
            {selected.size} selected
          </span>

          <button
            type="button"
            onClick={handleBulkDelete}
            style={{
              background: 'var(--do-red)',
              color: 'var(--white)',
              border: 'none',
              borderRadius: 'var(--do-r-full)',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={bulkEnrollmentStatus}
              onChange={(e) => setBulkEnrollmentStatus(e.target.value)}
              style={{
                background: 'var(--do-surface)',
                border: '1px solid var(--do-border-dark)',
                borderRadius: 'var(--do-r-sm)',
                color: 'var(--do-text2)',
                fontSize: 12,
                padding: '5px 10px',
              }}
            >
              <option value="active">active</option>
              <option value="contacted">contacted</option>
              <option value="completed">completed</option>
              <option value="bounced">bounced</option>
              <option value="unsubscribed">unsubscribed</option>
              <option value="wrong_person">wrong_person</option>
            </select>
            <button
              type="button"
              onClick={handleBulkStatus}
              className="do-btn-outline"
              style={{ fontSize: 12, padding: '5px 14px' }}
            >
              Apply enrollment
            </button>
          </div>

          <button
            type="button"
            onClick={handleBulkReenroll}
            className="do-btn-gold"
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            Re-enroll (recover)
          </button>
        </div>
      )}

      {/* ── Leads table ── */}
      <div className="do-card" style={{ overflow: 'hidden' }}>
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--do-border)',
          fontSize: 12,
          color: 'var(--do-text3)',
          fontWeight: 500,
        }}>
          {leads.length} lead{leads.length !== 1 ? 's' : ''}
          {tab === TAB_BOUNCED ? ' — bounced or invalid' : ''}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="do-tbl" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={visibleIds.length > 0 && selected.size === visibleIds.length}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Campaigns</th>
                <th>Sending inbox</th>
                <th>Enrolled</th>
                {tab === TAB_BOUNCED && <th style={{ minWidth: 200 }}>New email</th>}
                {tab === TAB_BOUNCED && <th style={{ width: 160 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--do-text4)' }}>
                    No leads match this view.
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id}>
                    <td style={{ verticalAlign: 'top' }}>
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.has(l.id)}
                        onChange={() => toggleOne(l.id)}
                        aria-label={`Select ${l.email}`}
                      />
                    </td>
                    <td className="mono" style={{ verticalAlign: 'top' }}>
                      <Link
                        to={`/leads/${l.id}`}
                        style={{ color: 'var(--do-gold-dark)', textDecoration: 'none', fontWeight: 500 }}
                        onMouseOver={e => e.target.style.textDecoration = 'underline'}
                        onMouseOut={e => e.target.style.textDecoration = 'none'}
                      >
                        {l.email}
                      </Link>
                    </td>
                    <td style={{ verticalAlign: 'top', color: 'var(--do-text2)' }}>{l.name || '—'}</td>
                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {l.email_verification_status && (
                          <span className={statusPillClass(l.email_verification_status)}>
                            verify: {l.email_verification_status}
                          </span>
                        )}
                        {(l.campaigns || []).slice(0, 3).map((c) => (
                          <span
                            key={c.campaign_id}
                            className={statusPillClass(c.status)}
                            title={`${c.campaign_name}: ${c.status}${c.interest ? ` · ${c.interest}` : ''}`}
                          >
                            {c.status}
                          </span>
                        ))}
                        {(l.campaigns || []).length > 3 && (
                          <span style={{ fontSize: 11, color: 'var(--do-text4)' }}>+{l.campaigns.length - 3}</span>
                        )}
                        {!(l.campaigns || []).length && !l.email_verification_status && (
                          <span style={{ color: 'var(--do-text4)', fontSize: 12 }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
                        {(l.campaigns || []).map((c) => (
                          <Link
                            key={c.campaign_id}
                            to={`/campaigns/${c.campaign_id}#leads`}
                            style={{
                              background: 'var(--do-surf3)',
                              border: '1px solid var(--do-border)',
                              borderRadius: 'var(--do-r-full)',
                              padding: '2px 8px',
                              fontSize: 11,
                              color: 'var(--do-text2)',
                              textDecoration: 'none',
                              fontWeight: 500,
                            }}
                          >
                            {c.campaign_name}
                          </Link>
                        ))}
                        {!(l.campaigns || []).length && <span style={{ color: 'var(--do-text4)' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 220 }}>
                        {(l.campaigns || []).map((c) => (
                          <div key={c.campaign_id} style={{ fontSize: 11 }}>
                            {c.from_inbox_email ? (
                              <span
                                className="mono"
                                style={{ color: 'var(--do-text2)', fontSize: 11 }}
                                title={`${c.campaign_name}: sent from ${c.from_inbox_email}`}
                              >
                                {c.from_inbox_email}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--do-text4)' }}>—</span>
                            )}
                          </div>
                        ))}
                        {!(l.campaigns || []).length && <span style={{ color: 'var(--do-text4)', fontSize: 11 }}>—</span>}
                      </div>
                    </td>
                    <td style={{ verticalAlign: 'top', color: 'var(--do-text3)', fontSize: 12 }}>
                      {formatEnrolled(l.campaigns)}
                    </td>
                    {tab === TAB_BOUNCED && (
                      <td style={{ verticalAlign: 'top' }}>
                        <input
                          type="email"
                          value={emailDrafts[l.id] ?? l.email}
                          onChange={(e) =>
                            setEmailDrafts((prev) => ({ ...prev, [l.id]: e.target.value }))
                          }
                          style={{
                            width: '100%',
                            background: 'var(--do-surface)',
                            border: '1px solid var(--do-border-dark)',
                            borderRadius: 'var(--do-r-sm)',
                            color: 'var(--do-text)',
                            fontSize: 12,
                            padding: '5px 8px',
                            fontFamily: 'var(--do-font-mono)',
                          }}
                        />
                      </td>
                    )}
                    {tab === TAB_BOUNCED && (
                      <td style={{ verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <button
                            type="button"
                            onClick={() => recoverOne(l)}
                            className="do-btn-gold"
                            style={{ fontSize: 11, padding: '5px 10px' }}
                          >
                            Save &amp; recover
                          </button>
                          <button
                            type="button"
                            onClick={() => markActiveOne(l)}
                            className="do-btn-outline"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                          >
                            Active only
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}