import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, apiCache } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useConfirm } from '../context/ConfirmContext';
import { useNotify } from '../context/NotificationContext';
import { useSubscription } from '../hooks/useSubscription';

/* ── status helpers ── */
function getStatus(c) {
  const stats = c.stats || {};
  const emailsSent  = stats.emails_sent || 0;
  const scheduled   = stats.scheduled   || 0;
  const totalLeads  = stats.total_leads || 0;
  const needsCustom = stats.needs_custom_email || 0;
  if (c.paused)                                          return 'paused';
  if (!c.paused && scheduled === 0 && emailsSent > 0)    return 'completed';
  if (needsCustom > 0 && totalLeads === needsCustom)     return 'needs_writing';
  if (totalLeads === 0)                                   return 'draft';
  return 'active';
}

const STATUS_CFG = {
  active:        { label: 'Active',        pillCls: 'do-pill-green'  },
  paused:        { label: 'Paused',        pillCls: 'do-pill-orange' },
  completed:     { label: 'Completed',     pillCls: 'do-pill-blue'   },
  needs_writing: { label: 'Needs Writing', pillCls: 'do-pill-gold'   },
  draft:         { label: 'Draft',         pillCls: 'do-pill-gray'   },
};

const BAR_COLOR = {
  active:        'var(--do-gold)',
  paused:        'var(--do-orange)',
  completed:     'var(--do-blue)',
  needs_writing: 'var(--info)',
  draft:         'var(--do-border-dark)',
};

/* ── icons ── */
const IconGrip = () => (
  <svg width="12" height="16" viewBox="0 0 12 16" fill="none">
    <circle cx="4" cy="4" r="1.5" fill="currentColor"/>
    <circle cx="8" cy="4" r="1.5" fill="currentColor"/>
    <circle cx="4" cy="8" r="1.5" fill="currentColor"/>
    <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
    <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
  </svg>
);

/* ── action button ── */
function ActionBtn({ children, danger, onClick, as: As, to, disabled }) {
  const style = {
    padding: '5px 12px',
    borderRadius: 'var(--do-r-full)',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textDecoration: 'none',
    transition: 'all .15s ease',
    opacity: disabled ? 0.45 : 1,
    borderColor: danger ? 'var(--do-red-light)' : 'var(--do-border-dark)',
    background: danger ? 'var(--do-red-light)' : 'transparent',
    color: danger ? 'var(--do-red-dark)' : 'var(--do-text2)',
  };
  if (As && to) return <As to={to} style={style}>{children}</As>;
  return <button style={style} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function Campaigns() {
  const { isActive } = useSubscription();
  const [campaigns, setCampaigns]   = useState(() => apiCache.get('/campaigns') || []);
  const [error, setError]           = useState(null);
  const [strategy, setStrategy]     = useState('priority');
  const [orderChanged, setOrderChanged] = useState(false);
  const dragSrcIdx = useRef(null);
  const confirm = useConfirm();
  const notify  = useNotify();

  const load = useCallback(async () => {
    try {
      const [camp, strat] = await Promise.all([
        api.get('/campaigns'),
        api.get('/settings/scheduling-strategy').catch(() => ({ scheduling_strategy: 'priority' })),
      ]);
      setCampaigns(camp);
      setStrategy(strat.scheduling_strategy || 'priority');
      setOrderChanged(false);
    } catch { setError('Failed to load campaigns'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── drag & drop ── */
  const onDragStart = (e, idx) => {
    dragSrcIdx.current = idx;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver  = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); };
  const onDragLeave = (e) => { e.currentTarget.classList.remove('drag-over'); };
  const onDrop      = (e, idx) => {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    const src = dragSrcIdx.current;
    if (src === null || src === idx) return;
    const next = [...campaigns];
    const [moved] = next.splice(src, 1);
    next.splice(idx, 0, moved);
    setCampaigns(next);
    setOrderChanged(true);
  };
  const onDragEnd   = (e) => { e.currentTarget.classList.remove('dragging'); dragSrcIdx.current = null; };

  const saveOrder = async () => {
    if (!orderChanged) return;
    try {
      await api.post('/campaigns/reorder', { campaign_ids: campaigns.map(c => c.id) });
      setOrderChanged(false);
      notify({ type: 'success', message: 'Order saved' });
    } catch { notify({ type: 'error', message: 'Error saving order' }); }
  };

  const togglePause = async (id, paused, name) => {
    if (!await confirm(`${paused ? 'Resume' : 'Pause'} campaign "${name}"?`)) return;
    await api.patch(`/campaigns/${id}`, { paused: !paused });
    load();
  };
  const deleteCampaign = async (id, name) => {
    if (!await confirm(`Delete campaign "${name}"? This cannot be undone.`)) return;
    await api.del(`/campaigns/${id}`);
    load();
  };
  const duplicateCampaign = async (id, name) => {
    if (!await confirm(`Duplicate campaign "${name}"?`)) return;
    const c = await api.post(`/campaigns/${id}/duplicate`);
    notify({ type: 'success', message: 'Campaign duplicated: ' + c.name });
    load();
  };

  const isPriority = strategy === 'priority';

  if (error) return (
    <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto', background: 'var(--do-bg)' }}>
      <div style={{ background: 'var(--do-red-light)', color: 'var(--do-red-dark)', padding: '10px 16px', borderRadius: 'var(--do-r)', fontSize: 13 }}>{error}</div>
    </div>
  );

  return (
    <div style={{ minHeight: 0, flex: 1, overflowY: 'auto', padding: '24px 28px', background: 'var(--do-bg)' }}>

      {/* ── HERO ── */}
      <div className="do-hero">
        <div className="do-hero-eyebrow">Outreach · Campaigns</div>
        <div className="do-hero-title">Your Campaigns</div>
        <div className="do-hero-sub">
          {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} · {isPriority ? 'Priority scheduling — drag to reorder' : 'Round-robin scheduling'}
        </div>
        <div className="do-hero-actions">
          {isActive ? (
            <Link to="/campaigns/add" style={{ textDecoration: 'none' }}>
              <button className="do-btn-hero">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 4v12M4 10h12"/></svg>
                New Campaign
              </button>
            </Link>
          ) : (
            <button className="do-btn-hero" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Upgrade to continue">
              New Campaign
            </button>
          )}
          <Link to="/analytics" style={{ textDecoration: 'none' }}>
            <button className="do-btn-hero-outline">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="2,14 7,9 11,13 18,6"/></svg>
              Analytics
            </button>
          </Link>
        </div>
      </div>

      {/* ── strategy hint ── */}
      {isPriority && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: 'var(--do-text3)' }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--do-gold-dark)" strokeWidth="1.8">
            <path d="M3 5h14M3 10h14M3 15h14"/>
          </svg>
          <span><strong style={{ color: 'var(--do-text2)' }}>Priority mode</strong> — drag rows to set send order</span>
          <span style={{ color: 'var(--do-border-dark)' }}>·</span>
          <Link to="/settings#general" style={{ color: 'var(--do-gold-dark)', textDecoration: 'none', fontWeight: 600 }}>Change strategy</Link>
        </div>
      )}

      {/* ── EMPTY ── */}
      {campaigns.length === 0 && (
        <div className="do-card">
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="var(--do-text4)" strokeWidth="1.2" style={{ margin: '0 auto 14px' }}>
              <path d="M3 10l14-7-7 14v-7L3 10z"/>
            </svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--do-text2)', marginBottom: 6, fontFamily: 'var(--do-font-serif)' }}>No campaigns yet</div>
            <div style={{ fontSize: 13, color: 'var(--do-text4)', marginBottom: 20 }}>Create your first campaign to start sending</div>
            {isActive ? (
              <Link to="/campaigns/add" style={{ textDecoration: 'none' }}>
                <button className="do-btn-gold">
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 4v12M4 10h12"/></svg>
                  Create Campaign
                </button>
              </Link>
            ) : (
              <button className="do-btn-gold" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Upgrade to Create</button>
            )}
          </div>
        </div>
      )}

      {/* ── TABLE ── */}
      {campaigns.length > 0 && (
        <>
          <div className="do-card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="do-tbl">
                <thead>
                  <tr>
                    {isPriority && <th style={{ width: 32 }}></th>}
                    {isPriority && <th style={{ width: 36, textAlign: 'center' }}>#</th>}
                    <th>Campaign</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Progress</th>
                    <th style={{ textAlign: 'center' }}>Replies</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c, idx) => {
                    const stats     = c.stats || {};
                    const emailsSent  = stats.emails_sent || 0;
                    const scheduled   = stats.scheduled   || 0;
                    const totalLeads  = stats.total_leads || 0;
                    const replies     = stats.replies     || 0;
                    const bounced     = stats.bounced     || 0;
                    const unsub       = stats.unsubscribed || 0;
                    const needsCustom = stats.needs_custom_email || 0;
                    const denom       = emailsSent + scheduled;
                    const percent     = denom > 0 ? Math.round((emailsSent / denom) * 100) : 0;
                    const replyRate   = emailsSent > 0 ? Math.round((replies / emailsSent) * 100) : 0;
                    const status      = getStatus(c);
                    const cfg         = STATUS_CFG[status];
                    const barColor    = BAR_COLOR[status];
                    const pausedPct   = status === 'paused' && totalLeads > 0
                      ? Math.round((emailsSent / totalLeads) * 100) : 0;
                    const barPct = status === 'paused' ? pausedPct : percent;

                    const reasonParts = [];
                    if (replies    > 0) reasonParts.push(`${replies} replied`);
                    if (bounced    > 0) reasonParts.push(`${bounced} bounced`);
                    if (unsub      > 0) reasonParts.push(`${unsub} unsub`);
                    if (needsCustom> 0) reasonParts.push(`${needsCustom} needs writing`);

                    return (
                      <tr
                        key={c.id}
                        draggable={isPriority}
                        onDragStart={e => isPriority && onDragStart(e, idx)}
                        onDragOver={e  => isPriority && onDragOver(e)}
                        onDragLeave={e => isPriority && onDragLeave(e)}
                        onDrop={e      => isPriority && onDrop(e, idx)}
                        onDragEnd={e   => isPriority && onDragEnd(e)}
                      >
                        {isPriority && (
                          <>
                            <td style={{ color: 'var(--do-text4)', cursor: 'grab', paddingLeft: 14 }}>
                              <IconGrip />
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'var(--do-font-mono)', fontSize: 11, color: 'var(--do-text4)' }}>
                              {idx + 1}
                            </td>
                          </>
                        )}

                        {/* name */}
                        <td>
                          {status === 'paused' ? (
                            <span style={{ color: 'var(--do-text3)', fontWeight: 500 }}>{c.name}</span>
                          ) : (
                            <Link to={`/campaigns/${c.id}`} style={{ color: 'var(--do-gold-dark)', fontWeight: 600, textDecoration: 'none' }}>
                              {c.name}
                            </Link>
                          )}
                        </td>

                        {/* status */}
                        <td><span className={`do-pill ${cfg.pillCls}`}>{cfg.label}</span></td>

                        {/* progress */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 110 }}>
                            <div className="do-prog-bar" style={{ width: 90 }}>
                              <div className="do-prog-fill" style={{ width: `${barPct}%`, background: barColor }} />
                            </div>
                            <span style={{ fontSize: 10, fontFamily: 'var(--do-font-mono)', color: 'var(--do-text3)' }}>
                              {status === 'paused'
                                ? `${emailsSent} / ${totalLeads} leads`
                                : status === 'completed'
                                ? `${emailsSent} sent — done`
                                : `${emailsSent} / ${denom} (${percent}%)`}
                            </span>
                            {reasonParts.length > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--do-text4)' }}>{reasonParts.join(' · ')}</span>
                            )}
                          </div>
                        </td>

                        {/* replies */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontFamily: 'var(--do-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--do-text)' }}>{replies}</span>
                            <span style={{ fontSize: 10, color: 'var(--do-text4)' }}>{replyRate}% rate</span>
                          </div>
                        </td>

                        {/* actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <ActionBtn as={Link} to={`/campaigns/${c.id}`}>View</ActionBtn>
                            <ActionBtn onClick={() => togglePause(c.id, c.paused, c.name)}>
                              {c.paused ? 'Resume' : 'Pause'}
                            </ActionBtn>
                            <ActionBtn onClick={() => duplicateCampaign(c.id, c.name)}>Clone</ActionBtn>
                            <ActionBtn danger onClick={() => deleteCampaign(c.id, c.name)}>Delete</ActionBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* save order bar */}
          {isPriority && orderChanged && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 18px', background: 'var(--do-gold-bg)',
              border: '1px solid var(--do-gold)', borderRadius: 'var(--do-r)',
              marginTop: 4,
            }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--do-gold-dark)" strokeWidth="1.8">
                <path d="M10 4v12M4 10h12"/>
              </svg>
              <span style={{ fontSize: 13, color: 'var(--do-gold-dark)', fontWeight: 500, flex: 1 }}>
                Priority order changed — save to apply
              </span>
              <button className="do-btn-gold" style={{ padding: '6px 16px', fontSize: 12 }} onClick={saveOrder}>
                Save Order
              </button>
            </div>
          )}

          {/* bottom create button */}
          <div style={{ marginTop: 16 }}>
            {isActive ? (
              <Link to="/campaigns/add" style={{ textDecoration: 'none' }}>
                <button className="do-btn-gold">
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 4v12M4 10h12"/></svg>
                  New Campaign
                </button>
              </Link>
            ) : (
              <div style={{ position: 'relative', display: 'inline-block' }} className="group">
                <button className="do-btn-gold" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>New Campaign</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}