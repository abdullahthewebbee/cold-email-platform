import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import Icon from '../components/ui/AegisIcon';

/* Done-for-you setup — customers request a managed setup of domains,
   inboxes, DNS and warm-up. See BACKEND_SPEC.md for the API contract. */

const INCLUDED = [
  { icon: 'globe',        title: 'Domains',          text: 'We register and configure sending domains for you.' },
  { icon: 'mail',         title: 'Inboxes',          text: 'Google Workspace or Microsoft 365 mailboxes, created and secured.' },
  { icon: 'shield-check', title: 'DNS & authentication', text: 'SPF, DKIM, DMARC and tracking domain set up correctly.' },
  { icon: 'flame',        title: 'Warm-up',          text: 'A safe ramp-up plan so new inboxes build reputation.' },
  { icon: 'link',         title: 'Connected to InboxAir', text: 'Inboxes are connected and ready to use in Accounts.' },
];

const EXTRAS = [
  { id: 'email_verification', label: 'Email verification' },
  { id: 'tracking_domain',    label: 'Custom tracking domain' },
  { id: 'gmail_sync',         label: 'Gmail / inbox sync' },
  { id: 'api_keys',           label: 'API keys' },
  { id: 'webhooks',           label: 'Webhooks' },
  { id: 'mcp',                label: 'MCP (AI assistants)' },
  { id: 'n8n',                label: 'n8n integration' },
  { id: 'visitor_id',         label: 'Website visitor script' },
];

const STAGES = ['Submitted', 'Domains & DNS', 'Inboxes & warm-up', 'Ready'];
const STATUS = {
  submitted:         { label: 'Submitted',         pill: 'do-pill-gray',   stage: 0 },
  in_review:         { label: 'In review',         pill: 'do-pill-blue',   stage: 0 },
  awaiting_customer: { label: 'Needs your input',  pill: 'do-pill-orange', stage: 1 },
  in_progress:       { label: 'In progress',       pill: 'do-pill-gold',   stage: 2 },
  completed:         { label: 'Completed',         pill: 'do-pill-green',  stage: 3 },
  cancelled:         { label: 'Cancelled',         pill: 'do-pill-red',    stage: -1 },
};

const EMPTY = {
  business_name: '', website: '', provider: 'google', domains_count: 3,
  inboxes_per_domain: 2, daily_volume: 100, preferred_domains: '', notes: '', extra_setup: [],
};

const CSS = `
.dfy-page{display:flex;flex-direction:column;gap:16px;width:100%}
.dfy-hero.do-hero{margin:0 !important;padding:26px 32px 26px 36px !important}
.dfy-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:start}
.dfy-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;box-shadow:var(--shadow-sm);overflow:hidden}
.dfy-head{display:flex;align-items:center;gap:14px;padding:18px 24px 14px}
.dfy-ico{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--badge-bg-gold);color:var(--gold-dark);flex:none}
.dfy-title{font-size:15px;font-weight:700;color:var(--text)}
.dfy-sub{font-size:12px;color:var(--text-3);margin-top:1px}
.dfy-body{padding:6px 24px 24px;border-top:1px solid var(--border)}
.dfy-form{display:grid;grid-template-columns:1fr 1fr;gap:16px 18px;padding-top:18px}
.dfy-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dfy-field.full{grid-column:1/-1}
.dfy-field label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3)}
.dfy-field input,.dfy-field select,.dfy-field textarea{width:100%;box-sizing:border-box}
.dfy-field textarea{min-height:84px;resize:vertical;border:1px solid var(--border);border-radius:14px;padding:10px 14px;font:inherit;font-size:13px}
.dfy-checks{display:flex;flex-wrap:wrap;gap:8px 10px}
.dfy-check{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--border);border-radius:999px;font-size:12.5px;font-weight:600;color:var(--text);cursor:pointer;background:var(--surface)}
.dfy-check:hover{background:var(--badge-bg-gold)}
.dfy-check.on{background:var(--badge-bg-gold);border-color:var(--gold-dark);color:var(--gold-dark)}
.dfy-check input{accent-color:var(--gold-dark);margin:0}
.dfy-hint{font-size:11.5px;color:var(--text-3)}
.dfy-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
.dfy-inc{list-style:none;margin:0;padding:6px 0 0;display:flex;flex-direction:column}
.dfy-inc li{display:flex;gap:14px;align-items:flex-start;padding:14px 24px;border-top:1px solid var(--border)}
.dfy-inc li:first-child{border-top:0}
.dfy-inc .dfy-ico{width:34px;height:34px;border-radius:10px}
.dfy-inc b{display:block;font-size:13px;color:var(--text)}
.dfy-inc span{font-size:12px;color:var(--text-3);line-height:1.45}
.dfy-order{padding:18px 24px;border-top:1px solid var(--border)}
.dfy-order-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dfy-order-name{font-size:14px;font-weight:700;color:var(--text)}
.dfy-order-meta{font-size:12px;color:var(--text-3);margin-top:2px}
.dfy-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.dfy-step{font-size:11px;font-weight:600;color:var(--text-3)}
.dfy-step i{display:block;height:5px;border-radius:99px;background:var(--border);margin-bottom:6px}
.dfy-step.done{color:var(--text)}
.dfy-step.done i{background:var(--gold-dark)}
.dfy-msg{margin-top:12px;padding:10px 14px;border-radius:12px;background:var(--badge-bg-gold);font-size:12.5px;color:var(--text);line-height:1.5}
.dfy-empty{padding:32px 24px;text-align:center;font-size:13px;color:var(--text-3);border-top:1px solid var(--border)}
@media(max-width:1000px){.dfy-grid{grid-template-columns:1fr}.dfy-form{grid-template-columns:1fr}}
`;

function fmt(d) { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } }

export default function DoneForYou() {
  const notify = useNotify();
  const confirm = useConfirm?.() ?? (async () => true);
  const [form, setForm] = useState(EMPTY);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const toggleExtra = (id) => setForm(f => ({ ...f, extra_setup: f.extra_setup.includes(id) ? f.extra_setup.filter(x => x !== id) : [...f.extra_setup, id] }));
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/done-for-you/orders');
      setOrders(Array.isArray(data) ? data : (data?.items || []));
    } catch (err) {
      setOrders([]);
      notify({ type: 'error', message: err.message || 'Could not load orders' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.business_name.trim()) { notify({ type: 'error', message: 'Business name is required' }); return; }
    setSubmitting(true);
    try {
      await api.post('/done-for-you/orders', {
        ...form,
        domains_count: Number(form.domains_count) || 1,
        inboxes_per_domain: Number(form.inboxes_per_domain) || 1,
        daily_volume: Number(form.daily_volume) || 0,
        preferred_domains: form.preferred_domains.split('\n').map(s => s.trim()).filter(Boolean),
      });
      notify({ type: 'success', message: 'Request submitted. We will review it shortly.' });
      setForm(EMPTY);
      load();
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Could not submit request' });
    } finally { setSubmitting(false); }
  };

  const cancel = async (o) => {
    if (!await confirm('Cancel this setup request?')) return;
    try { await api.post(`/done-for-you/orders/${o.id}/cancel`, {}); load(); }
    catch (err) { notify({ type: 'error', message: err.message || 'Could not cancel' }); }
  };

  const totalInboxes = (Number(form.domains_count) || 0) * (Number(form.inboxes_per_domain) || 0);

  return (
    <div className="dfy-page">
      <style>{CSS}</style>

      <div className="do-hero dfy-hero">
        <div className="do-hero-eyebrow">Setup · Done-for-you</div>
        <div className="do-hero-title">Done-for-you Setup</div>
        <div className="do-hero-sub">Tell us what you need. We set up domains, inboxes, DNS and warm-up so you can start sending.</div>
      </div>

      <div className="dfy-grid">
        <form className="dfy-card" onSubmit={submit}>
          <div className="dfy-head">
            <span className="dfy-ico"><Icon name="sparkles" size={18} /></span>
            <div>
              <div className="dfy-title">Request a setup</div>
              <div className="dfy-sub">{totalInboxes} inbox{totalInboxes === 1 ? '' : 'es'} across {Number(form.domains_count) || 0} domain{Number(form.domains_count) === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="dfy-body">
            <div className="dfy-form">
              <div className="dfy-field"><label>Business name</label><input value={form.business_name} onChange={set('business_name')} placeholder="Acme Inc." /></div>
              <div className="dfy-field"><label>Website</label><input value={form.website} onChange={set('website')} placeholder="https://acme.com" /></div>
              <div className="dfy-field"><label>Mailbox provider</label>
                <select value={form.provider} onChange={set('provider')}>
                  <option value="google">Google Workspace</option>
                  <option value="microsoft">Microsoft 365</option>
                  <option value="mixed">Mix of both</option>
                </select>
              </div>
              <div className="dfy-field"><label>Daily sending target</label><input type="number" min="10" value={form.daily_volume} onChange={set('daily_volume')} /></div>
              <div className="dfy-field"><label>Number of domains</label><input type="number" min="1" max="50" value={form.domains_count} onChange={set('domains_count')} /></div>
              <div className="dfy-field"><label>Inboxes per domain</label><input type="number" min="1" max="10" value={form.inboxes_per_domain} onChange={set('inboxes_per_domain')} /></div>
              <div className="dfy-field full"><label>Preferred domain names</label>
                <textarea value={form.preferred_domains} onChange={set('preferred_domains')} placeholder={'getacme.com\nacmehq.io'} />
                <span className="dfy-hint">One per line. Optional — we will suggest options if you leave this empty.</span>
              </div>
              <div className="dfy-field full"><label>Also set up for me (optional)</label>
                <div className="dfy-checks">
                  {EXTRAS.map(x => (
                    <label key={x.id} className={`dfy-check${form.extra_setup.includes(x.id) ? ' on' : ''}`}>
                      <input type="checkbox" checked={form.extra_setup.includes(x.id)} onChange={() => toggleExtra(x.id)} />{x.label}
                    </label>
                  ))}
                </div>
                <span className="dfy-hint">Tick any Settings features you want our team to configure for you.</span>
              </div>
              <div className="dfy-field full"><label>Notes</label>
                <textarea value={form.notes} onChange={set('notes')} placeholder="Sender names, signature, anything we should know" />
              </div>
            </div>
            <div className="dfy-actions">
              <button type="button" className="do-btn-outline" onClick={() => setForm(EMPTY)} disabled={submitting}>Reset</button>
              <button type="submit" className="do-btn-hero" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit request'}</button>
            </div>
          </div>
        </form>

        <div className="dfy-card">
          <div className="dfy-head">
            <span className="dfy-ico"><Icon name="check-circle" size={18} /></span>
            <div><div className="dfy-title">What is included</div><div className="dfy-sub">Everything needed to start sending</div></div>
          </div>
          <ul className="dfy-inc">
            {INCLUDED.map(i => (
              <li key={i.title}>
                <span className="dfy-ico"><Icon name={i.icon} size={16} /></span>
                <div><b>{i.title}</b><span>{i.text}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dfy-card">
        <div className="dfy-head">
          <span className="dfy-ico"><Icon name="clipboard-list" size={18} /></span>
          <div><div className="dfy-title">Your requests</div><div className="dfy-sub">{orders.length} total</div></div>
        </div>
        {loading && <div className="dfy-empty">Loading…</div>}
        {!loading && orders.length === 0 && <div className="dfy-empty">No requests yet. Submit the form above to get started.</div>}
        {orders.map(o => {
          const st = STATUS[o.status] || STATUS.submitted;
          return (
            <div key={o.id} className="dfy-order">
              <div className="dfy-order-top">
                <div>
                  <div className="dfy-order-name">{o.business_name || `Request #${o.id}`}</div>
                  <div className="dfy-order-meta">
                    {o.domains_count} domain{o.domains_count === 1 ? '' : 's'} · {o.inboxes_per_domain} inbox{o.inboxes_per_domain === 1 ? '' : 'es'} each · {fmt(o.created_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`do-pill ${st.pill}`}>{st.label}</span>
                  {['submitted', 'in_review'].includes(o.status) && (
                    <button className="do-btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => cancel(o)}>Cancel</button>
                  )}
                </div>
              </div>
              {st.stage >= 0 && (
                <div className="dfy-steps">
                  {STAGES.map((s, i) => <div key={s} className={`dfy-step${i <= st.stage ? ' done' : ''}`}><i />{s}</div>)}
                </div>
              )}
              {Array.isArray(o.extra_setup) && o.extra_setup.length > 0 && (
                <div className="dfy-order-meta" style={{ marginTop: 8 }}>Also: {o.extra_setup.map(id => (EXTRAS.find(x => x.id === id) || { label: id }).label).join(', ')}</div>
              )}
              {o.message && <div className="dfy-msg">{o.message}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
