import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useNotifications } from '../context/NotificationsContext';
import { useNotify } from '../context/NotificationContext';
import { Input } from '../components/ui/Input';
import { RiMailOpenLine, RiMailSendLine, RiMailCheckLine, RiMailCloseLine, RiUserReceivedLine, RiUserUnfollowLine, RiErrorWarningLine, RiTimerLine, RiSpeedLine, RiKey2Line, RiDeleteBinLine, RiCheckDoubleLine, RiSparklingLine, RiEyeLine, RiCursorLine, RiSearchLine } from '../components/ui/aegisRi';
import Icon from '../components/ui/AegisIcon';

const css = `
  /* ── Notifications ── */

  /* tabs */
  .notif-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--do-border);
    background: var(--do-bg);
    padding: 0 1.5rem;
  }
  .notif-tab {
    padding: 0.7rem 1rem;
    font-size: 0.83rem;
    font-weight: 500;
    color: var(--do-text3);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    background: none;
    border-top: none; border-left: none; border-right: none;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }
  .notif-tab:hover { color: var(--do-text); }
  .notif-tab.active { color: var(--do-gold-dark); border-bottom-color: var(--do-gold); font-weight: 600; }

  /* search */
  .notif-search-wrap { position: relative; margin-bottom: 0.6rem; }
  .notif-search-wrap svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--do-text4); pointer-events: none; }
  .notif-search {
    width: 100%; padding: 0.5rem 0.75rem 0.5rem 2.25rem;
    font-size: 0.83rem;
    border: 1px solid var(--do-border-dark);
    border-radius: var(--do-r-sm);
    background: var(--do-surface);
    color: var(--do-text);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
  }
  .notif-search:focus { border-color: var(--do-gold); box-shadow: 0 0 0 3px var(--do-gold-bg); }
  .notif-cat-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }

  /* notification item */
  .notif-item {
    display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 0.75rem; border-radius: var(--do-r);
    cursor: pointer; transition: background 0.12s; position: relative;
  }
  .notif-item.read { background: var(--do-surface); }
  .notif-item.read:hover { background: var(--do-surf2); }
  .notif-item.unread { background: var(--do-gold-bg); }
  .notif-item.unread:hover { background: var(--gold-dim); }

  .notif-icon { color: var(--do-gold-dark); flex-shrink: 0; margin-top: 2px; }
  .notif-title { font-size: 0.83rem; color: var(--do-text); margin: 0 0 0.2rem; }
  .notif-title.bold { font-weight: 600; }
  .notif-msg {
    font-size: 0.75rem; color: var(--do-text3); margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 42ch;
  }
  .notif-meta { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem; }
  .notif-time { font-size: 0.68rem; color: var(--do-text4); font-family: var(--do-font-mono); }
  .notif-new-badge {
    font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 0.15rem 0.45rem; border-radius: var(--do-r-full);
    background: var(--do-gold-bg); color: var(--do-gold-dark);
    border: 1px solid var(--do-gold);
  }
  .notif-item-actions {
    display: flex; align-items: center; gap: 0.2rem;
    opacity: 0; transition: opacity 0.12s; margin-left: auto; flex-shrink: 0;
  }
  .notif-item:hover .notif-item-actions { opacity: 1; }
  .notif-act-btn {
    padding: 0.2rem; background: none; border: none; cursor: pointer;
    color: var(--do-text3); border-radius: var(--do-r-xs);
    transition: color 0.12s; display: flex; align-items: center;
  }
  .notif-act-btn:hover { color: var(--do-gold-dark); }
  .notif-act-btn.danger:hover { color: var(--do-red); }

  /* group header */
  .notif-group-hdr {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem; cursor: pointer;
    border-radius: var(--do-r-lg) var(--do-r-lg) 0 0;
    transition: background 0.12s;
  }
  .notif-group-hdr.read { background: var(--do-surface); }
  .notif-group-hdr.read:hover { background: var(--do-surf2); }
  .notif-group-hdr.unread { background: var(--do-gold-bg); }
  .notif-group-hdr.unread:hover { background: var(--gold-dim); }

  /* group container */
  .notif-group-wrap {
    border: 1px solid var(--do-border);
    border-radius: var(--do-r-lg);
    overflow: hidden;
    background: var(--do-surface);
  }

  /* bulk bar */
  .notif-bulk-bar {
    position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    background: var(--do-text); border: 1px solid var(--border-active);
    border-radius: var(--do-r-lg);
    box-shadow: var(--do-shadow-lg); z-index: 50; white-space: nowrap;
  }
  .notif-bulk-label { font-size: 0.8rem; font-weight: 600; color: var(--do-bg); }
  .notif-bulk-btn {
    display: flex; align-items: center; gap: 0.35rem;
    padding: 0.35rem 0.85rem; font-size: 0.75rem; font-weight: 600;
    border-radius: var(--do-r-sm); border: 1px solid; cursor: pointer;
    background: transparent; transition: background 0.12s;
  }
  .notif-bulk-btn.gold { border-color: var(--do-gold); color: var(--do-gold); }
  .notif-bulk-btn.gold:hover { background: var(--gold-dim); }
  .notif-bulk-btn.red { border-color: var(--do-red); color: var(--do-red); }
  .notif-bulk-btn.red:hover { background: rgba(224,85,85,.1); }
  .notif-bulk-close { font-size: 0.75rem; color: var(--do-text4); background: none; border: none; cursor: pointer; }
  .notif-bulk-close:hover { color: var(--do-text3); }

  /* preferences */
  .notif-pref-section {
    background: var(--do-surface);
    border: 1px solid var(--do-border);
    border-radius: var(--do-r-lg);
    padding: 1.25rem 1.5rem;
  }
  .notif-pref-section h2 {
    font-family: var(--do-font-serif);
    font-size: 1rem; font-weight: 700; color: var(--do-text);
    margin: 0 0 0; padding-bottom: 0.65rem;
    border-bottom: 1px solid var(--do-border);
  }
  .notif-pref-hint { font-size: 0.75rem; color: var(--do-text3); margin: 0.5rem 0 0.85rem; }
  .notif-checkbox-label {
    display: flex; align-items: center; gap: 0.5rem;
    cursor: pointer; padding: 0.25rem 0; font-size: 0.83rem; color: var(--do-text);
  }
  .notif-checkbox-label input[type="checkbox"] { accent-color: var(--do-gold-dark); width: 14px; height: 14px; flex-shrink: 0; }

  /* spinner */
  @keyframes notif-spin { to { transform: rotate(360deg); } }
  .notif-spinner {
    width: 2rem; height: 2rem;
    border: 2px solid var(--do-border);
    border-top-color: var(--do-gold);
    border-radius: 50%;
    animation: notif-spin 0.7s linear infinite;
    margin: 0 auto 1rem;
  }
  .notif-spinner-sm {
    display: inline-block; width: 1rem; height: 1rem;
    border: 2px solid var(--do-border);
    border-top-color: var(--do-gold);
    border-radius: 50%;
    animation: notif-spin 0.7s linear infinite;
    vertical-align: middle; margin-right: 0.4rem;
  }
`;

const EVENT_ICONS = {
  'email.sent': <RiMailSendLine size={20} />,
  'email.opened': <RiEyeLine size={20} />,
  'email.clicked': <RiCursorLine size={20} />,
  'email.bounced': <RiMailCloseLine size={20} />,
  'lead.replied': <RiMailCheckLine size={20} />,
  'lead.unsubscribed': <RiUserUnfollowLine size={20} />,
  'lead.status_changed': <RiUserReceivedLine size={20} />,
  'lead.interested': <RiSparklingLine size={20} />,
  'lead.not_interested': <RiUserUnfollowLine size={20} />,
  'lead.out_of_office': <RiTimerLine size={20} />,
  'lead.wrong_person': <RiUserUnfollowLine size={20} />,
  'lead.auto_reply': <RiTimerLine size={20} />,
  'feature.error': <RiErrorWarningLine size={20} />,
  'daily_limit': <RiSpeedLine size={20} />,
  'rate_limit': <RiSpeedLine size={20} />,
  'token_expired': <RiKey2Line size={20} />,
};

const EVENT_LABELS = {
  'email.sent': 'Email Sent', 'email.opened': 'Email Opened', 'email.clicked': 'Link Clicked',
  'email.bounced': 'Email Bounced', 'lead.replied': 'Lead Replied',
  'lead.unsubscribed': 'Lead Unsubscribed', 'lead.status_changed': 'Status Changed',
  'lead.interested': 'Lead Interested (AI)', 'lead.not_interested': 'Lead Not Interested (AI)',
  'lead.out_of_office': 'Out of Office (AI)', 'lead.wrong_person': 'Wrong Person (AI)',
  'lead.auto_reply': 'Auto Reply (AI)', 'feature.error': 'Feature Error',
  'daily_limit': 'Daily Limit Hit', 'rate_limit': 'Rate Limit', 'token_expired': 'Token Expired',
};

const EVENT_CATEGORIES = {
  'email': ['email.sent', 'email.opened', 'email.clicked', 'email.bounced'],
  'lead': ['lead.replied', 'lead.unsubscribed', 'lead.status_changed', 'lead.interested', 'lead.not_interested', 'lead.out_of_office', 'lead.wrong_person', 'lead.auto_reply'],
  'system': ['daily_limit', 'rate_limit', 'token_expired', 'feature.error'],
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotificationItem({ n, onRead, onDelete, navigate, selected, onSelect }) {
  const handleClick = () => {
    if (!n.read_at) onRead(n.id);
    if (n.lead_id) navigate(`/leads/${n.lead_id}`);
    else if (n.campaign_id) navigate(`/campaigns/${n.campaign_id}`);
    else if (n.inbox_id) navigate(`/inboxes/${n.inbox_id}`);
    else if (n.event_type?.startsWith('email.')) navigate('/analytics');
    else if (['daily_limit', 'rate_limit', 'token_expired'].includes(n.event_type)) navigate('/inboxes');
    else navigate('/notifications');
  };

  return (
    <div onClick={handleClick} className={`notif-item ${n.read_at ? 'read' : 'unread'}`}>
      <input
        type="checkbox" checked={selected}
        onClick={e => e.stopPropagation()} onChange={() => onSelect(n.id)}
        style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--do-gold-dark)' }}
      />
      <div className="notif-icon">{EVENT_ICONS[n.event_type] || <RiMailOpenLine size={20} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className={`notif-title${n.read_at ? '' : ' bold'}`}>{n.title}</p>
        <p className="notif-msg">{n.message}</p>
        <div className="notif-meta">
          <span className="notif-time">{timeAgo(n.created_at)}</span>
          {!n.read_at && <span className="notif-new-badge">New</span>}
        </div>
      </div>
      <div className="notif-item-actions">
        {!n.read_at && (
          <button className="notif-act-btn" onClick={e => { e.stopPropagation(); onRead(n.id); }} title="Mark as read">
            <RiCheckDoubleLine size={16} />
          </button>
        )}
        <button className="notif-act-btn danger" onClick={e => { e.stopPropagation(); onDelete(n.id); }} title="Dismiss">
          <RiDeleteBinLine size={16} />
        </button>
      </div>
    </div>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { refresh: refreshBadge } = useNotifications();
  const notify = useNotify();
  const offsetRef = useRef(0);
  const fetchGenRef = useRef(0);

  const [activeTab, setActiveTab] = useState('all');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [visibleTypes, setVisibleTypes] = useState(() => {
    try { const s = localStorage.getItem('inboxair_visible_notif_types') ?? localStorage.getItem('emissary_visible_notif_types'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const saveVisibleTypes = (types) => { setVisibleTypes(types); try { localStorage.setItem('inboxair_visible_notif_types', JSON.stringify(types)); localStorage.removeItem('emissary_visible_notif_types'); } catch {} };
  const toggleVisibleType = (evt) => {
    const all = Object.keys(EVENT_LABELS);
    const cur = visibleTypes || all;
    const next = cur.includes(evt) ? cur.filter(e => e !== evt) : [...cur, evt];
    saveVisibleTypes(next.length === all.length ? null : next);
  };

  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredItems.map(n => n.id)));
  };

  const bulkMarkRead = async () => {
    const ids = [...selectedIds].filter(id => { const n = items.find(i => i.id === id); return n && !n.read_at; });
    await Promise.all(ids.map(id => api.patch(`/notifications/${id}/read`)));
    setItems(prev => prev.map(n => selectedIds.has(n.id) ? { ...n, read_at: new Date().toISOString() } : n));
    setUnread(prev => Math.max(0, prev - ids.length));
    setSelectedIds(new Set()); refreshBadge();
  };
  const bulkDelete = async () => {
    await Promise.all([...selectedIds].map(id => api.del(`/notifications/${id}`)));
    const removedUnread = items.filter(n => selectedIds.has(n.id) && !n.read_at).length;
    setItems(prev => prev.filter(n => !selectedIds.has(n.id)));
    setTotal(prev => prev - selectedIds.size);
    setUnread(prev => Math.max(0, prev - removedUnread));
    setSelectedIds(new Set()); refreshBadge();
  };

  const [eventTypes, setEventTypes] = useState([]);
  const [notifConfig, setNotifConfig] = useState({ enabled: false, notification_email: '', events: [], rate_limit_per_hour: 10 });
  const [configSaving, setConfigSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const limit = 50;

  const fetchNotifications = useCallback(async (reset = false) => {
    const gen = ++fetchGenRef.current;
    if (reset) { setItems([]); setTotal(0); offsetRef.current = 0; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === 'unread') params.set('unread_only', 'true');
      params.set('limit', String(limit));
      params.set('offset', String(offsetRef.current));
      const data = await api.get(`/notifications?${params.toString()}`);
      if (gen !== fetchGenRef.current) return;
      setItems(reset ? data.items : prev => [...prev, ...data.items]);
      setTotal(data.total); setUnread(data.unread);
      if (data.items.length > 0) offsetRef.current += limit;
    } catch (e) { if (gen === fetchGenRef.current) console.error(e); }
    finally { if (gen === fetchGenRef.current) setLoading(false); }
  }, [activeTab]);

  useEffect(() => { setSearchQuery(''); setFilterCategory(null); fetchNotifications(true); }, [activeTab]);
  useEffect(() => {
    api.get('/settings/webhooks/events').then(d => setEventTypes(d.events || [])).catch(() => {});
    api.get('/notifications/config').then(d => setNotifConfig(d)).catch(() => {});
  }, []);
  useEffect(() => {
    const source = new EventSource('/api/notifications/events');
    source.addEventListener('notification.new', (evt) => {
      try {
        const n = JSON.parse(evt.data);
        setItems(prev => { if (prev.find(i => i.id === n.id)) return prev; return [n, ...prev]; });
        setTotal(prev => prev + 1);
        if (!n.read_at) { setUnread(prev => prev + 1); refreshBadge(); }
      } catch (e) { console.error('SSE parse error', e); }
    });
    source.onerror = () => {};
    return () => source.close();
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnread(prev => Math.max(0, prev - 1)); refreshBadge();
    } catch (e) { console.error(e); }
  };
  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnread(0); refreshBadge();
    } catch (e) { console.error(e); }
  };
  const dismiss = async (id) => {
    try {
      await api.del(`/notifications/${id}`);
      const removed = items.find(n => n.id === id);
      setItems(prev => prev.filter(n => n.id !== id));
      setTotal(prev => prev - 1);
      if (removed && !removed.read_at) setUnread(prev => Math.max(0, prev - 1));
      refreshBadge();
    } catch (e) { console.error(e); }
  };

  const toggleEvent = (evt) => setNotifConfig(prev => ({
    ...prev, events: prev.events.includes(evt) ? prev.events.filter(e => e !== evt) : [...prev.events, evt],
  }));
  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await api.put('/notifications/config', notifConfig);
      setNotifConfig(res);
      notify({ message: 'Notification preferences saved', type: 'success' });
    } catch (e) { notify({ message: 'Failed to save preferences', type: 'error' }); }
    finally { setConfigSaving(false); }
  };

  const filteredItems = useMemo(() => {
    let r = items;
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(n => (n.title || '').toLowerCase().includes(q) || (n.message || '').toLowerCase().includes(q)); }
    if (filterCategory) { const cats = EVENT_CATEGORIES[filterCategory] || []; r = r.filter(n => cats.includes(n.event_type)); }
    if (visibleTypes) r = r.filter(n => visibleTypes.includes(n.event_type));
    return r;
  }, [items, searchQuery, filterCategory, visibleTypes]);

  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const groupedItems = useMemo(() => {
    const groups = [];
    for (const n of filteredItems) {
      const last = groups[groups.length - 1];
      if (last && last.event_type === n.event_type && last.campaign_id === n.campaign_id && last.items.length >= 1) {
        last.items.push(n); last.count = last.items.length;
        if (!n.read_at) last.hasUnread = true;
      } else {
        groups.push({ key: `${n.id}`, event_type: n.event_type, campaign_id: n.campaign_id, count: 1, hasUnread: !n.read_at, items: [n] });
      }
    }
    return groups;
  }, [filteredItems]);

  const toggleGroup = (key) => setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const filterCategories = [
    { key: null, label: 'All' }, { key: 'email', label: 'Email' },
    { key: 'lead', label: 'Leads' }, { key: 'system', label: 'System' },
  ];
  const isFiltered = searchQuery.trim() || filterCategory;

  return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>

        {/* Hero */}
        <div className="do-hero" style={{ borderRadius: 0 }}>
          <div className="do-hero-eyebrow">InboxAir · Notifications</div>
          <div className="do-hero-title">Activity Feed</div>
          <div className="do-hero-sub">Stay updated on campaign activity, lead replies, and system events.</div>
          {unread > 0 && (
            <div className="do-hero-actions">
              <button className="do-btn-hero" onClick={markAllRead}>
                <RiCheckDoubleLine size={14} />
                {unread} unread — Mark all as read
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="notif-tabs">
          {[
            { id: 'all', label: `All (${total})` },
            { id: 'unread', label: `Unread (${unread})` },
            { id: 'preferences', label: 'Preferences' },
          ].map(t => (
            <button key={t.id} className={`notif-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => { setSearchQuery(''); setFilterCategory(null); setActiveTab(t.id); }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'var(--do-bg)' }}>

          {activeTab !== 'preferences' && (
            <>
              {/* Search + filter */}
              <div style={{ maxWidth: 680, marginBottom: '1rem' }}>
                <div className="notif-search-wrap">
                  <RiSearchLine size={16} />
                  <input type="text" className="notif-search" value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} placeholder="Search notifications…" />
                </div>
                <div className="notif-cat-pills">
                  {filterCategories.map(cat => (
                    <button key={cat.key ?? 'all'} onClick={() => setFilterCategory(cat.key)}
                      className={`do-preset-pill${filterCategory === cat.key ? ' active' : ''}`}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {loading && items.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--do-text3)' }}>
                  <div className="notif-spinner" />
                  <p style={{ fontSize: '0.83rem' }}>Loading notifications…</p>
                </div>
              )}

              {!loading && filteredItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--do-text3)' }}>
                  <RiMailOpenLine size={48} style={{ margin: '0 auto 1rem', opacity: 0.25 }} />
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--do-text)', marginBottom: '0.25rem' }}>
                    {isFiltered ? 'No matching notifications' : 'No notifications'}
                  </p>
                  <p style={{ fontSize: '0.83rem' }}>
                    {isFiltered ? 'Try adjusting your search or filter.'
                      : activeTab === 'unread' ? "You're all caught up!"
                      : 'Notifications will appear here when events occur.'}
                  </p>
                </div>
              )}

              {filteredItems.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', maxWidth: 680, marginBottom: '0.5rem' }}>
                  <input type="checkbox"
                    checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                    onChange={toggleSelectAll}
                    style={{ accentColor: 'var(--do-gold-dark)' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--do-text4)' }}>Select all</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--do-text4)', marginLeft: 'auto' }}>
                    {isFiltered ? `${filteredItems.length} of ${items.length} loaded` : `${items.length} of ${total}`}
                  </span>
                </div>
              )}

              {filteredItems.length > 0 && (
                <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {groupedItems.map(group => group.count === 1 ? (
                    <NotificationItem key={group.key} n={group.items[0]} onRead={markRead} onDelete={dismiss}
                      navigate={navigate} selected={selectedIds.has(group.items[0].id)} onSelect={toggleSelect} />
                  ) : (
                    <div key={group.key} className="notif-group-wrap">
                      <div className={`notif-group-hdr ${group.hasUnread ? 'unread' : 'read'}`} onClick={() => toggleGroup(group.key)}>
                        <div className="notif-icon">{EVENT_ICONS[group.event_type] || <RiMailOpenLine size={20} />}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: 'var(--do-text)' }}>
                            {group.count} {EVENT_LABELS[group.event_type] || group.event_type} events
                            {group.campaign_id ? ` · Campaign #${group.campaign_id}` : ''}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--do-text3)', marginTop: 2 }}>
                            {expandedGroups.has(group.key) ? 'Click to collapse' : 'Click to expand'}
                          </p>
                        </div>
                        <span className={group.hasUnread ? 'notif-new-badge' : 'do-pill do-pill-gray'}
                          style={{ fontVariantNumeric: 'tabular-nums' }}>{group.count}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--do-text4)', marginLeft: 4 }}>
                          {expandedGroups.has(group.key) ? '▲' : '▼'}
                        </span>
                      </div>
                      {expandedGroups.has(group.key) && (
                        <div style={{ borderTop: '1px solid var(--do-border)', maxHeight: group.items.length > 20 ? 400 : undefined, overflowY: group.items.length > 20 ? 'auto' : undefined }}>
                          {group.items.map(n => (
                            <NotificationItem key={n.id} n={n} onRead={markRead} onDelete={dismiss}
                              navigate={navigate} selected={selectedIds.has(n.id)} onSelect={toggleSelect} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab !== 'unread' && items.length < total && !loading && (
                <div style={{ marginTop: '1.5rem', textAlign: 'center', maxWidth: 680 }}>
                  <button className="do-btn-outline" onClick={() => { if (items.length < total) fetchNotifications(false); }}>Load more</button>
                </div>
              )}
              {loading && items.length > 0 && (
                <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.83rem', color: 'var(--do-text3)', maxWidth: 680 }}>
                  <span className="notif-spinner-sm" /> Loading more…
                </div>
              )}
            </>
          )}

          {activeTab === 'preferences' && (
            <div style={{ maxWidth: 580, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="notif-pref-section">
                <h2>Email Notifications</h2>
                <label className="notif-checkbox-label" style={{ marginTop: '0.65rem' }}>
                  <input type="checkbox" checked={notifConfig.enabled}
                    onChange={e => setNotifConfig(prev => ({ ...prev, enabled: e.target.checked }))} />
                  Send me email notifications
                </label>
                {notifConfig.enabled && (
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Input label="Notification email (optional)" type="email" value={notifConfig.notification_email}
                      onChange={e => setNotifConfig(prev => ({ ...prev, notification_email: e.target.value }))}
                      placeholder="Leave empty to use your account email" size="sm" />
                    <Input label="Rate limit per hour" type="number" min={1} max={100} value={notifConfig.rate_limit_per_hour}
                      onChange={e => setNotifConfig(prev => ({ ...prev, rate_limit_per_hour: parseInt(e.target.value) || 10 }))}
                      size="sm" style={{ width: 96 }} />
                  </div>
                )}
              </div>
              <div className="notif-pref-section">
                <h2>Event Types</h2>
                <p className="notif-pref-hint">Choose which events generate notifications. In-app notifications are always created. Email is sent only when the email channel is enabled above.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.1rem 1rem' }}>
                  {eventTypes.map(evt => (
                    <label key={evt} className="notif-checkbox-label">
                      <input type="checkbox" checked={notifConfig.events.includes(evt)} onChange={() => toggleEvent(evt)} />
                      {EVENT_LABELS[evt] || evt}
                    </label>
                  ))}
                  {eventTypes.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--do-text3)' }}>Loading event types…</p>}
                </div>
              </div>
              <div className="notif-pref-section">
                <h2>Show in Notification List</h2>
                <p className="notif-pref-hint">Local filter — does not affect what gets created or emailed.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.1rem 1rem' }}>
                  {Object.entries(EVENT_LABELS).map(([evt, label]) => (
                    <label key={evt} className="notif-checkbox-label">
                      <input type="checkbox" checked={visibleTypes === null || visibleTypes.includes(evt)} onChange={() => toggleVisibleType(evt)} />
                      {label}
                    </label>
                  ))}
                </div>
                {visibleTypes !== null && (
                  <button onClick={() => saveVisibleTypes(null)}
                    style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--do-gold-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Reset to show all
                  </button>
                )}
              </div>
              <div>
                <button className="do-btn-gold" onClick={saveConfig} disabled={configSaving}>
                  {configSaving ? 'Saving…' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="notif-bulk-bar">
            <span className="notif-bulk-label">{selectedIds.size} selected</span>
            <button className="notif-bulk-btn gold" onClick={bulkMarkRead}><RiCheckDoubleLine size={14} /> Mark read</button>
            <button className="notif-bulk-btn red" onClick={bulkDelete}><RiDeleteBinLine size={14} /> Delete</button>
            <button className="notif-bulk-close" onClick={() => setSelectedIds(new Set())}><Icon name="x" size={14} /></button>
          </div>
        )}
      </div>
    </>
  );
}