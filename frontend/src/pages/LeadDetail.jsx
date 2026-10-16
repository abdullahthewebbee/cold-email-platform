import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useNotify } from '../context/NotificationContext';
import { useLoading } from '../context/LoadingContext';

function formatDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const css = `
/* ── LeadDetail scoped styles ── */
.ld-wrap {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--do-text);
  background: var(--do-surface);
}

/* ── Hero banner ── */
.ld-hero {
  background: var(--gold-dim);
  border-radius: 14px;
  padding: 2rem 2rem 1.75rem;
  color: var(--text);
}
.ld-hero-eyebrow {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.ld-hero-eyebrow a {
  color: var(--do-gold);
  text-decoration: none;
}
.ld-hero-eyebrow a:hover { text-decoration: underline; }
.ld-hero-eyebrow .ld-sep { margin: 0 0.4rem; opacity: 0.4; }
.ld-hero-name {
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 0.3rem;
  color: var(--text);
}
.ld-hero-email {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}
.ld-hero-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.ld-hero-meta { flex: 1; min-width: 0; }
.ld-hero-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.ld-hero-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  border: 1.5px solid var(--border-active);
  background: var(--gold-hover);
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}
.ld-hero-action-btn:hover {
  background: var(--gold-dim);
  border-color: var(--text-muted);
}

/* ── Status pills ── */
.ld-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}
.ld-pill {
  font-size: 0.72rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-family: ui-monospace, Consolas, monospace;
  background: var(--gold-hover);
  color: var(--text);
  border: 1px solid var(--border);
}
.ld-pill-provider {
  background: rgba(201,168,76,0.18);
  border-color: rgba(201,168,76,0.35);
  color: var(--do-gold);
}

/* ── Section cards ── */
.ld-card {
  background: var(--do-cream);
  border: 1.5px solid var(--do-border);
  border-radius: 10px;
  padding: 1.25rem;
}
.ld-card-title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--do-text);
  margin: 0 0 0.75rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--do-border);
}
.ld-card-hint {
  font-size: 0.75rem;
  color: var(--do-text-muted);
  margin: -0.25rem 0 0.75rem;
  line-height: 1.5;
}
.ld-empty {
  font-size: 0.85rem;
  color: var(--do-text-muted);
}

/* ── Campaign list ── */
.ld-campaign-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ld-campaign-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--do-border);
}
.ld-campaign-item:last-child { border-bottom: none; }
.ld-campaign-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
}
.ld-campaign-link {
  color: var(--do-gold-dark);
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
}
.ld-campaign-link:hover { text-decoration: underline; }
.ld-campaign-pubid {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.7rem;
  color: var(--do-text-muted);
  margin-left: 0.4rem;
}
.ld-campaign-enrolled {
  font-size: 0.78rem;
  color: var(--do-text-muted);
}
.ld-campaign-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.ld-badge {
  font-size: 0.68rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-family: ui-monospace, Consolas, monospace;
  background: var(--do-gold-bg, rgba(201,168,76,0.08));
  color: var(--do-text-muted);
  border: 1px solid var(--do-border);
}
.ld-badge-interest {
  background: rgba(139,92,246,0.08);
  color: var(--info);
  border-color: rgba(139,92,246,0.2);
}
.ld-badge-paused {
  background: rgba(217,119,6,0.08);
  color: var(--warning);
  border-color: rgba(217,119,6,0.2);
}

/* ── Custom data table ── */
.ld-table-wrap { overflow-x: auto; }
.ld-table {
  width: 100%;
  table-layout: auto;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.ld-table td {
  border: 1px solid var(--do-border);
  padding: 0.35rem 0.6rem;
  vertical-align: top;
}
.ld-table tr:nth-child(even) td {
  background: var(--do-gold-bg, rgba(201,168,76,0.05));
}
.ld-table-key {
  font-weight: 600;
  color: var(--do-text);
  white-space: nowrap;
  min-width: 120px;
}
.ld-table-val {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.75rem;
  word-break: break-all;
  color: var(--do-text-muted);
}

/* ── Interactions timeline ── */
.ld-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.85rem;
}
.ld-timeline-item {
  border-left: 3px solid transparent;
  padding-left: 0.85rem;
  position: relative;
}
.ld-timeline-item.outbound { border-color: var(--do-gold); }
.ld-timeline-item.inbound  { border-color: var(--info); }
.ld-timeline-kind {
  font-weight: 600;
  color: var(--do-text);
}
.ld-timeline-meta {
  font-size: 0.73rem;
  color: var(--do-text-muted);
  margin-top: 0.2rem;
  font-family: ui-monospace, Consolas, monospace;
}
.ld-timeline-meta .ld-timeline-subject {
  font-weight: 600;
  color: var(--do-text);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.ld-timeline-snippet {
  font-size: 0.78rem;
  color: var(--do-text-muted);
  margin-top: 0.3rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Error / loading states ── */
.ld-error-wrap {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.ld-error-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--do-text);
}
.ld-error-msg { color: var(--danger); font-size: 0.9rem; }
.ld-loading {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  color: var(--do-text-muted);
  font-size: 0.9rem;
}
`;

export default function LeadDetail() {
  const { id } = useParams();
  const notify = useNotify();
  const loading = useLoading();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    loading.start();
    setError(null);
    try {
      const l = await api.get(`/leads/${id}`);
      setLead(l);
    } catch (e) {
      setError(e.message || 'Failed to load lead');
      notify({ type: 'error', message: 'Could not load lead' });
    } finally {
      loading.stop();
    }
  }, [id, loading, notify]);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !lead) {
    return (
      <>
        <style>{css}</style>
        <div className="ld-error-wrap">
          <p className="ld-error-title">Lead</p>
          <p className="ld-error-msg">{error}</p>
          <Button as={Link} to="/leads" variant="outline">Back to Leads</Button>
        </div>
      </>
    );
  }

  if (!lead) {
    return (
      <>
        <style>{css}</style>
        <div className="ld-loading">Loading…</div>
      </>
    );
  }

  const customEntries = Object.entries(lead.custom_data || {});

  return (
    <>
      <style>{css}</style>
      <div className="ld-wrap">

        {/* ── Hero ── */}
        <div className="ld-hero">
          <div className="ld-hero-row">
            <div className="ld-hero-meta">
              <p className="ld-hero-eyebrow">
                <Link to="/leads">Leads</Link>
                <span className="ld-sep">/</span>
                <span>#{lead.id}</span>
              </p>
              <h1 className="ld-hero-name">{lead.name || lead.email}</h1>
              <p className="ld-hero-email">{lead.email}</p>
            </div>
            <div className="ld-hero-actions">
              <Link to="/unibox" className="ld-hero-action-btn">
                Open Unibox
              </Link>
            </div>
          </div>

          {(lead.email_verification_status || lead.provider) && (
            <div className="ld-pills">
              {lead.email_verification_status && (
                <span className="ld-pill">verify: {lead.email_verification_status}</span>
              )}
              {lead.provider && (
                <span className="ld-pill ld-pill-provider">{lead.provider}</span>
              )}
            </div>
          )}
        </div>

        {/* ── Campaigns ── */}
        <div className="ld-card">
          <h2 className="ld-card-title">Campaigns</h2>
          {lead.campaigns?.length ? (
            <ul className="ld-campaign-list">
              {lead.campaigns.map((c) => (
                <li key={c.campaign_id} className="ld-campaign-item">
                  <div className="ld-campaign-top">
                    <div>
                      <Link to={`/campaigns/${c.campaign_id}#leads`} className="ld-campaign-link">
                        {c.campaign_name}
                      </Link>
                      <span className="ld-campaign-pubid">{c.campaign_public_id}</span>
                    </div>
                    <span className="ld-campaign-enrolled">enrolled {formatDt(c.enrolled_at)}</span>
                  </div>
                  <div className="ld-campaign-badges">
                    <span className="ld-badge">status: {c.status || 'active'}</span>
                    {c.interest && (
                      <span className="ld-badge ld-badge-interest">interest: {c.interest}</span>
                    )}
                    <span className="ld-badge">
                      opened {c.opened ? 'yes' : 'no'} · clicked {c.clicked ? 'yes' : 'no'} · replied {c.replied ? 'yes' : 'no'}
                    </span>
                    {c.sending_paused && (
                      <span className="ld-badge ld-badge-paused">paused</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ld-empty">Not enrolled in any campaign.</p>
          )}
        </div>

        {/* ── Custom data ── */}
        <div className="ld-card">
          <h2 className="ld-card-title">Custom data</h2>
          {customEntries.length ? (
            <div className="ld-table-wrap">
              <table className="ld-table">
                <tbody>
                  {customEntries.map(([k, v]) => (
                    <tr key={k}>
                      <td className="ld-table-key">{k}</td>
                      <td className="ld-table-val">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ld-empty">No custom fields.</p>
          )}
        </div>

        {/* ── Interactions ── */}
        <div className="ld-card" style={{ overflowX: 'auto' }}>
          <h2 className="ld-card-title">Interactions</h2>
          <p className="ld-card-hint">
            Outbound sends and inbound messages we can associate (mirrored mail + reply markers). Full threads: Unibox.
          </p>
          {lead.interactions?.length ? (
            <ul className="ld-timeline">
              {lead.interactions.map((row, i) => (
                <li
                  key={`${row.at}-${row.kind}-${i}`}
                  className={`ld-timeline-item ${row.direction === 'outbound' ? 'outbound' : 'inbound'}`}
                >
                  <div className="ld-timeline-kind">
                    {row.direction === 'outbound' ? 'Sent' : 'Received'}
                    {row.kind && row.kind !== 'sent' ? ` · ${row.kind.replace(/_/g, ' ')}` : ''}
                  </div>
                  <div className="ld-timeline-meta">
                    {row.campaign_name && <span>{row.campaign_name} · </span>}
                    {row.subject && <span className="ld-timeline-subject">{row.subject} · </span>}
                    {formatDt(row.at)}
                  </div>
                  {row.snippet && (
                    <p className="ld-timeline-snippet">{row.snippet}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ld-empty">No interaction history yet.</p>
          )}
        </div>

      </div>
    </>
  );
}