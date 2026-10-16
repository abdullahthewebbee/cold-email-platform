import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import Icon from './AegisIcon';
import { useUniboxNotifications } from '../../context/UniboxNotificationsContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { useSystemHealth } from '../../context/SystemHealthContext';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/analytics',      label: 'Analytics',      icon: <Icon name="bar-chart" size={20} /> },
  { to: '/campaigns',      label: 'Campaigns',      icon: <Icon name="send" size={20} /> },
  { to: '/leads',          label: 'Contacts',        icon: <Icon name="users" size={20} /> },
  { to: '/suppression',    label: 'Blocklist',       icon: <Icon name="shield-alert" size={20} /> },
  { to: '/inboxes',        label: 'Accounts',        icon: <Icon name="mail" size={20} /> },
  { to: '/unibox',         label: 'Inbox',           icon: <Icon name="inbox" size={20} /> },
  { to: '/schedule',       label: 'Queue',           icon: <Icon name="calendar" size={20} /> },
  { to: '/notifications',  label: 'Notifications',   icon: <Icon name="bell" size={20} /> },
  { to: '/dns-doctor',     label: 'Deliverability',  icon: <Icon name="shield-check" size={20} /> },
  { to: '/visitors',       label: 'Visitors',        icon: <Icon name="eye" size={20} /> },
  { to: '/done-for-you',   label: 'Done-for-you',    icon: <Icon name="sparkles" size={20} /> },
];

export const APP_VERSION = '0.1.0';

export function getOS() {
  const ua = navigator.userAgent;
  if (/Windows NT 10|Windows NT 11/.test(ua)) return 'Windows 10/11';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

export function getBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return 'Unknown';
}

/* Aegis sidebar: .sidebar / .nav-item / .nav-icon / .dropdown-menu come from styles/aegis.css.
   Only compact sizing and the few bits Aegis has no class for live here. */
const css = `
.sidebar { width: var(--sidebar-width); padding: 0; border-right: 1px solid var(--border); }
.sidebar.collapsed { width: var(--sidebar-collapsed-width); }

/* brand row: expand / collapse toggle first (like Claude), then the wordmark */
.sidebar .sidebar-brand { padding: 14px 12px 10px; display: flex; align-items: center; gap: 8px; }
.sb-toggle { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: var(--text-3); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; padding: 0; transition: background var(--transition), color var(--transition); }
.sb-toggle:hover { background: var(--badge-bg-gold); color: var(--gold-dark); }
.sidebar .sidebar-brand-link { flex: 1; min-width: 0; }
.sidebar .sidebar-brand { justify-content: space-between; padding: 14px 12px 10px 16px; }
.sidebar .sidebar-brand-name { font-size: 21px; }
.sidebar.collapsed .sidebar-brand { padding: 14px 0 10px; justify-content: center; }

/* nav: flat rows, small icons, medium size */
.sidebar .sidebar-nav { padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; }
.sidebar .nav-item {
  width: 100%; min-height: 36px; padding: 7px 12px; gap: 12px;
  font-size: 13.5px; font-weight: 500; color: var(--text-2);
  border-radius: 10px; text-decoration: none !important;
  transition: background var(--transition), color var(--transition);
}
.sidebar .nav-icon { width: 20px; height: 20px; border-radius: 0; background: none; color: inherit; position: relative; }
.sidebar .nav-icon svg { width: 18px; height: 18px; }
.sidebar .nav-item:hover, .sidebar .nav-item:focus-visible { background: var(--badge-bg-gold); color: var(--gold-dark); }
.sidebar .nav-item:hover .nav-icon, .sidebar .nav-item:hover .nav-label { color: var(--gold-dark); }
.sidebar .nav-item.active { background: var(--surface); color: var(--text); font-weight: 700; box-shadow: var(--shadow-xs); }
.sidebar .nav-item.active::before { content: ""; position: absolute; left: -10px; top: 7px; bottom: 7px; width: 4px; border-radius: 0 4px 4px 0; background: var(--gold-dark); }
.sidebar .nav-item.active .nav-icon { background: none; color: var(--gold-dark); }
.sidebar .nav-item.active:hover .nav-label { color: var(--gold-dark); }
.sidebar .nav-item, .sidebar .nav-item:hover, .sidebar .nav-label, .sidebar a, .sidebar a:hover { text-decoration: none !important; }
.sidebar.collapsed .sidebar-nav { padding: 6px 8px; }
.sidebar.collapsed .nav-item { padding: 8px 0; justify-content: center; gap: 0; }
.sidebar.collapsed .nav-item.active::before { left: -8px; }
.sidebar.collapsed .nav-icon { width: 20px; height: 20px; border-radius: 0; }

.sb-badge {
  position: absolute; top: -5px; right: -7px;
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: var(--radius-full);
  display: flex; align-items: center; justify-content: center;
  background: var(--red); color: var(--text-inverted);
  font-size: 9px; font-weight: 700; line-height: 1;
}
.sidebar .sidebar-footer { padding: 6px 10px 12px; position: relative; border-top: 1px solid var(--border); }
.sidebar.collapsed .sidebar-footer { padding: 6px 8px 12px; }
.sb-profile { position: relative; }
.sb-avatar { font-size: 11px; font-weight: 700; text-transform: uppercase; font-family: var(--font-sans); width: 24px !important; height: 24px !important; border-radius: 50% !important; background: var(--gold-dark) !important; color: var(--text-inverted) !important; }
.sidebar .nav-item:hover .sb-avatar, .sidebar .nav-item.active .sb-avatar { background: var(--gold-dark) !important; color: var(--text-inverted) !important; }
.sb-username { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 13px; font-weight: 600; }
.sb-chevron { flex-shrink: 0; color: var(--text-4); transition: transform var(--transition); }
.sb-chevron.open { transform: rotate(180deg); }
.sb-popup { bottom: calc(100% + 6px); top: auto; left: 10px; right: auto; width: 14rem; min-width: 0; }
.sidebar.collapsed .sb-popup { left: calc(var(--sidebar-collapsed-width) - 6px); bottom: 0; }
.sb-popup-user { padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
.sb-popup-name { font-size: 13px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-popup-email { font-size: 12px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.sb-popup .dropdown-item { padding: 7px 14px; font-size: 12.5px; }
.sb-popup .dropdown-item { justify-content: flex-start !important; text-align: left !important; width: 100%; background: none; border: 0; }
.sb-popup .dropdown-item > svg, .sb-popup .dropdown-item > span:first-child { flex: none; }
.sb-popup .dropdown-item svg { width: 14px; height: 14px; color: var(--text-3); }
.sb-health-dot { width: 7px; height: 7px; border-radius: 50%; position: absolute; top: -1px; right: -2px; }
.sb-health-dot.ok      { background: var(--green); }
.sb-health-dot.warning { background: var(--orange); }
.sb-health-dot.error   { background: var(--red); }
.sb-health-dot.unknown { background: var(--text-4); }
`;

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const { count: unreadCount } = useUniboxNotifications();
  const { count: notifUnreadCount } = useNotifications();
  const { startOnboarding } = useOnboarding();
  const { overallStatus } = useSystemHealth();
  const { logout, user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const [tip, setTip] = useState(null);

  const healthDotClass = {
    error:   'error',
    warning: 'warning',
    ok:      'ok',
    unknown: 'unknown',
  }[overallStatus] || 'unknown';

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showTip = (e, label) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hideTip = () => setTip(null);

  return (
    <>
      <style>{css}</style>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>

        {/* ── Brand: wordmark, then collapse toggle at its end ── */}
        <div className="sidebar-brand">
          {!collapsed && (
            <NavLink to="/" className="sidebar-brand-link" title="Home">
              <span className="sidebar-brand-name">InboxAir</span>
              <span className="sidebar-brand-dot" />
            </NavLink>
          )}
          <button
            onClick={onToggle}
            onMouseDown={e => e.preventDefault()}
            className="sb-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name="panel-left" size={19} />
          </button>
        </div>

        {/* ── Nav links ── */}
        <nav className="sidebar-nav">
          {links.map(l => {
            const isActive =
              location.pathname === l.to ||
              (l.to === '/analytics' && location.pathname === '/') ||
              (l.to.startsWith('/settings') && location.pathname === '/settings');
            const badge =
              l.to === '/unibox' ? unreadCount :
              l.to === '/notifications' ? notifUnreadCount : 0;

            return (
              <NavLink
                key={l.to}
                to={l.to}
                end
                onMouseEnter={e => showTip(e, l.label)}
                onMouseLeave={hideTip}
                className={({ isActive: navActive }) =>
                  `nav-item${(navActive || isActive) ? ' active' : ''}`
                }
              >
                <span className="nav-icon">
                  {l.icon}
                  {badge > 0 && <span className="sb-badge">{badge > 99 ? '99+' : badge}</span>}
                </span>
                <span className="nav-label">{l.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div className="sidebar-footer">

          <div className="sb-profile" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(v => !v)}
              onMouseEnter={e => showTip(e, user?.username || user?.email || 'Account')}
              onMouseLeave={hideTip}
              className={`nav-item${profileOpen ? ' active' : ''}`}
            >
              <span className="nav-icon sb-avatar">
                {(user?.username || user?.email || '?').charAt(0)}
              </span>
              <span className="nav-label sb-username">{user?.username || user?.email || 'Account'}</span>
              {!collapsed && (
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  className={`sb-chevron${profileOpen ? ' open' : ''}`}
                >
                  <polyline points="18,15 12,9 6,15" />
                </svg>
              )}
            </button>

            {profileOpen && (
              <div className="dropdown-menu open sb-popup">
                <div className="sb-popup-user">
                  <div className="sb-popup-name">{user?.username}</div>
                  <div className="sb-popup-email">{user?.email}</div>
                </div>

                <NavLink to="/settings#general" onClick={() => setProfileOpen(false)} className="dropdown-item">
                  <Icon name="settings" size={15} /> Settings
                </NavLink>
                <NavLink to="/system-health" onClick={() => setProfileOpen(false)} className="dropdown-item">
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <Icon name="activity" size={15} />
                    <span className={`sb-health-dot ${healthDotClass}`} />
                  </span>
                  System Health
                </NavLink>
                <button onClick={() => { setProfileOpen(false); startOnboarding(); }} className="dropdown-item">
                  <Icon name="help-circle" size={15} /> App Tour
                </button>
                <NavLink to="/deliverability-tips" onClick={() => setProfileOpen(false)} className="dropdown-item">
                  <Icon name="lightbulb" size={15} /> Deliverability Tips
                </NavLink>
                <NavLink to="/feedback?type=bug" onClick={() => setProfileOpen(false)} className="dropdown-item">
                  <Icon name="alert-circle" size={15} /> Report a Bug
                </NavLink>
                <NavLink to="/feedback?type=feature" onClick={() => setProfileOpen(false)} className="dropdown-item">
                  <Icon name="sparkles" size={15} /> Suggest a Feature
                </NavLink>

                <div className="dropdown-divider" />

                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="dropdown-item">
                  <Icon name="shield" size={15} /> Privacy Policy
                </a>
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="dropdown-item">
                  <Icon name="file-text" size={15} /> Terms of Service
                </a>

                <div className="dropdown-divider" />

                <button onClick={() => { setProfileOpen(false); logout(); }} className="dropdown-item danger">
                  <Icon name="log-out" size={15} /> Logout
                </button>
              </div>
            )}
          </div>

        </div>
      </aside>
      {tip && (
        <div className="sidebar-floating-tooltip visible" style={{ top: tip.top, left: tip.left }}>{tip.label}</div>
      )}
    </>
  );
}
