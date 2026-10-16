import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import Icon from '../components/ui/AegisIcon';

/* Website visitor ID — install a script on your site, see who visits,
   and add identified visitors to a campaign. See BACKEND_SPEC.md. */

const CSS = `
.vz-page{display:flex;flex-direction:column;gap:16px;width:100%}
.vz-hero.do-hero{display:flex !important;align-items:center;justify-content:space-between;gap:24px;margin:0 !important;padding:26px 32px 26px 36px !important}
.vz-hero-actions{flex:none;align-self:flex-start}
.vz-hero .do-btn-hero{display:inline-flex;align-items:center;gap:6px}
.vz-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.vz-stat{display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow-sm)}
.vz-stat-ico{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:var(--badge-bg-gold);color:var(--gold-dark);flex:none}
.vz-stat b{display:block;font-family:var(--font-serif);font-size:22px;line-height:1.1;color:var(--text)}
.vz-stat span{font-size:12px;color:var(--text-3)}
.vz-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow-sm);overflow:hidden}
.vz-head{display:flex;align-items:center;gap:14px;padding:18px 24px 14px;flex-wrap:wrap}
.vz-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--badge-bg-gold);color:var(--gold-dark);flex:none}
.vz-title{font-size:15px;font-weight:700;color:var(--text)}
.vz-sub{font-size:12px;color:var(--text-3);margin-top:1px}
.vz-tools{margin-left:auto;display:flex;gap:10px;flex-wrap:wrap}
.vz-tools input{width:220px}
.vz-site{padding:16px 24px;border-top:1px solid var(--border)}
.vz-site-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.vz-site-name{font-size:14px;font-weight:700;color:var(--text)}
.vz-site-meta{font-size:12px;color:var(--text-3);margin-top:2px}
.vz-code{margin-top:12px;display:flex;align-items:stretch;gap:10px}
.vz-code code{flex:1;min-width:0;display:block;padding:10px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--border);font-family:var(--font-mono,monospace);font-size:12px;color:var(--text-2);overflow-x:auto;white-space:nowrap}
.vz-table{width:100%;border-collapse:collapse}
.vz-table th{text-align:left;padding:10px 24px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3);border-top:1px solid var(--border);background:var(--bg)}
.vz-table td{padding:12px 24px;border-top:1px solid var(--border);font-size:13px;color:var(--text);vertical-align:middle}
.vz-table tr:hover td{background:var(--badge-bg-gold)}
.vz-person{display:flex;align-items:center;gap:12px;min-width:0}
.vz-avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:var(--surface-3,#f1ece2);color:var(--gold-dark);flex:none}
.vz-person b{display:block;font-size:13px}
.vz-person span{font-size:11.5px;color:var(--text-3)}
.vz-muted{color:var(--text-3)}
.vz-empty{padding:36px 24px;text-align:center;font-size:13px;color:var(--text-3);border-top:1px solid var(--border)}
.vz-overlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(26,22,16,.45);backdrop-filter:blur(3px)}
.vz-modal{width:100%;max-width:440px;background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:0 24px 60px rgba(26,22,16,.28);padding:24px}
.vz-modal h3{margin:0 0 4px;font-family:var(--font-serif);font-size:20px;color:var(--text)}
.vz-modal p{margin:0 0 16px;font-size:13px;color:var(--text-3)}
.vz-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.vz-field label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3)}
.vz-field input,.vz-field select{width:100%;box-sizing:border-box}
.vz-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:6px}
@media(max-width:900px){.vz-stats{grid-template-columns:1fr}.vz-hero.do-hero{flex-direction:column;align-items:flex-start}.vz-table th:nth-child(n+4),.vz-table td:nth-child(n+4){display:none}}
`;

const initials = (v) => (v.name || v.email || v.company || '?').trim().slice(0, 2).toUpperCase();
function ago(d) {
  if (!d) return '—';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const snippet = (site) =>
  site.snippet || `<script async src="${window.location.origin}/api/visitors/pixel.js?k=${site.public_key || site.id}"></script>`;

export default function Visitors() {
  const notify = useNotify();
  const confirm = useConfirm?.() ?? (async () => true);
  const [sites, setSites] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', domain: '' });
  const [assign, setAssign] = useState(null);   // visitor being added to a campaign
  const [campaignId, setCampaignId] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const list = (d) => Array.isArray(d) ? d : (d?.items || []);

  const loadSites = useCallback(async () => {
    try { setSites(list(await api.get('/visitors/sites'))); }
    catch (err) { setSites([]); notify({ type: 'error', message: err.message || 'Could not load websites' }); }
  }, []);

  const loadVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (siteFilter) qs.set('site_id', siteFilter);
      if (statusFilter) qs.set('status', statusFilter);
      if (search.trim()) qs.set('q', search.trim());
      setVisitors(list(await api.get(`/visitors${qs.toString() ? `?${qs}` : ''}`)));
    } catch (err) { setVisitors([]); notify({ type: 'error', message: err.message || 'Could not load visitors' }); }
    finally { setLoading(false); }
  }, [siteFilter, statusFilter, search]);

  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => { const t = setTimeout(loadVisitors, 250); return () => clearTimeout(t); }, [loadVisitors]);
  useEffect(() => { api.get('/campaigns').then(d => setCampaigns(list(d))).catch(() => {}); }, []);

  const identified = visitors.filter(v => v.identified).length;
  const companies = new Set(visitors.map(v => v.company).filter(Boolean)).size;

  const addSite = async () => {
    if (!newSite.domain.trim()) { notify({ type: 'error', message: 'Enter your website domain' }); return; }
    try {
      await api.post('/visitors/sites', { name: newSite.name.trim() || newSite.domain.trim(), domain: newSite.domain.trim() });
      setShowAdd(false); setNewSite({ name: '', domain: '' }); loadSites();
    } catch (err) { notify({ type: 'error', message: err.message || 'Could not add website' }); }
  };

  const removeSite = async (s) => {
    if (!await confirm(`Remove ${s.domain}? Its tracking script will stop working.`)) return;
    try { await api.del(`/visitors/sites/${s.id}`); loadSites(); loadVisitors(); }
    catch (err) { notify({ type: 'error', message: err.message || 'Could not remove website' }); }
  };

  const copy = async (s) => {
    try { await navigator.clipboard.writeText(snippet(s)); setCopiedId(s.id); setTimeout(() => setCopiedId(null), 1500); } catch {}
  };

  const addToCampaign = async () => {
    if (!campaignId) { notify({ type: 'error', message: 'Choose a campaign' }); return; }
    try {
      await api.post(`/visitors/${assign.id}/add-to-campaign`, { campaign_id: Number(campaignId) || campaignId });
      notify({ type: 'success', message: 'Added to campaign' });
      setAssign(null); setCampaignId(''); loadVisitors();
    } catch (err) { notify({ type: 'error', message: err.message || 'Could not add to campaign' }); }
  };

  return (
    <div className="vz-page">
      <style>{CSS}</style>

      <div className="do-hero vz-hero">
        <div>
          <div className="do-hero-eyebrow">Outreach · Visitors</div>
          <div className="do-hero-title">Website Visitor ID</div>
          <div className="do-hero-sub">See which people and companies visit your website, then reach out to them.</div>
        </div>
        <div className="vz-hero-actions">
          <button className="do-btn-hero" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} /> Add website</button>
        </div>
      </div>

      <div className="vz-stats">
        <div className="vz-stat"><span className="vz-stat-ico"><Icon name="eye" size={18} /></span><div><b>{visitors.length}</b><span>Visitors</span></div></div>
        <div className="vz-stat"><span className="vz-stat-ico"><Icon name="user-check" size={18} /></span><div><b>{identified}</b><span>Identified</span></div></div>
        <div className="vz-stat"><span className="vz-stat-ico"><Icon name="building" size={18} /></span><div><b>{companies}</b><span>Companies</span></div></div>
      </div>

      <div className="vz-card">
        <div className="vz-head">
          <span className="vz-ico"><Icon name="globe" size={18} /></span>
          <div><div className="vz-title">Websites</div><div className="vz-sub">Install the script on every page you want to track</div></div>
        </div>
        {sites.length === 0 && <div className="vz-empty">No websites yet. Add one to get your tracking script.</div>}
        {sites.map(s => (
          <div key={s.id} className="vz-site">
            <div className="vz-site-top">
              <div>
                <div className="vz-site-name">{s.name || s.domain}</div>
                <div className="vz-site-meta">{s.domain} · {s.last_event_at ? `last visit ${ago(s.last_event_at)}` : 'waiting for first visit'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`do-pill ${s.last_event_at ? 'do-pill-green' : 'do-pill-gray'}`}>{s.last_event_at ? 'Receiving data' : 'Not installed'}</span>
                <button className="do-btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => removeSite(s)}>Remove</button>
              </div>
            </div>
            <div className="vz-code">
              <code>{snippet(s)}</code>
              <button className="do-btn-gold" style={{ fontSize: 12, padding: '0 16px' }} onClick={() => copy(s)}>{copiedId === s.id ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        ))}
      </div>

      <div className="vz-card">
        <div className="vz-head">
          <span className="vz-ico"><Icon name="users" size={18} /></span>
          <div><div className="vz-title">Visitors</div><div className="vz-sub">{visitors.length} shown</div></div>
          <div className="vz-tools">
            <input type="search" placeholder="Search visitors…" value={search} onChange={e => setSearch(e.target.value)} />
            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
              <option value="">All websites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name || s.domain}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All visitors</option>
              <option value="identified">Identified</option>
              <option value="anonymous">Anonymous</option>
            </select>
          </div>
        </div>
        {loading && <div className="vz-empty">Loading…</div>}
        {!loading && visitors.length === 0 && <div className="vz-empty">No visitors yet. Once your script is installed, visitors appear here.</div>}
        {!loading && visitors.length > 0 && (
          <table className="vz-table">
            <thead><tr><th>Visitor</th><th>Company</th><th>Status</th><th>Pages</th><th>Visits</th><th>Last seen</th><th /></tr></thead>
            <tbody>
              {visitors.map(v => (
                <tr key={v.id}>
                  <td><div className="vz-person"><span className="vz-avatar">{initials(v)}</span><div style={{ minWidth: 0 }}><b>{v.name || 'Anonymous visitor'}</b><span>{v.email || v.location || '—'}</span></div></div></td>
                  <td>{v.company ? <><b style={{ fontWeight: 600 }}>{v.company}</b>{v.title && <div className="vz-muted" style={{ fontSize: 11.5 }}>{v.title}</div>}</> : <span className="vz-muted">—</span>}</td>
                  <td><span className={`do-pill ${v.identified ? 'do-pill-green' : 'do-pill-gray'}`}>{v.identified ? 'Identified' : 'Anonymous'}</span></td>
                  <td>{v.pages_viewed ?? 0}</td>
                  <td>{v.visits ?? 1}</td>
                  <td className="vz-muted">{ago(v.last_seen)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {v.identified && v.email && (v.lead_id
                      ? <span className="vz-muted" style={{ fontSize: 12 }}>In contacts</span>
                      : <button className="do-btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setAssign(v); setCampaignId(''); }}>Add to campaign</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <div className="vz-overlay" onClick={() => setShowAdd(false)}>
          <div className="vz-modal" onClick={e => e.stopPropagation()}>
            <h3>Add website</h3>
            <p>You will get a script to paste before the closing &lt;/head&gt; tag.</p>
            <div className="vz-field"><label>Domain</label><input value={newSite.domain} onChange={e => setNewSite(s => ({ ...s, domain: e.target.value }))} placeholder="acme.com" autoFocus /></div>
            <div className="vz-field"><label>Name (optional)</label><input value={newSite.name} onChange={e => setNewSite(s => ({ ...s, name: e.target.value }))} placeholder="Acme marketing site" /></div>
            <div className="vz-modal-actions">
              <button className="do-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="do-btn-hero" onClick={addSite}>Add website</button>
            </div>
          </div>
        </div>
      )}

      {assign && (
        <div className="vz-overlay" onClick={() => setAssign(null)}>
          <div className="vz-modal" onClick={e => e.stopPropagation()}>
            <h3>Add to campaign</h3>
            <p>{assign.name || assign.email} will be added as a contact and enrolled.</p>
            <div className="vz-field"><label>Campaign</label>
              <select value={campaignId} onChange={e => setCampaignId(e.target.value)}>
                <option value="">Choose a campaign…</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="vz-modal-actions">
              <button className="do-btn-outline" onClick={() => setAssign(null)}>Cancel</button>
              <button className="do-btn-hero" onClick={addToCampaign}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
