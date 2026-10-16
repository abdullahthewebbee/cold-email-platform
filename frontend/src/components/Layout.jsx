import React from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './ui/Sidebar';
import TestModeBanner from './TestModeBanner';
import Onboarding from './Onboarding';
import { NotificationProvider } from '../context/NotificationContext';
import { LoadingProvider } from '../context/LoadingContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { UniboxNotificationsProvider } from '../context/UniboxNotificationsContext';
import { AppModeProvider, useAppMode } from '../context/AppModeContext';
import { OnboardingProvider } from '../context/OnboardingContext';
import BillingWallBanner from './BillingWallBanner';

function LayoutInner({ children, sidebarCollapsed, setSidebarCollapsed }) {
  const { isProduction } = useAppMode();
  const { pathname } = useLocation();
  const isDashboard = pathname === '/' || pathname === '/analytics';
  const contentMargin = sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)';

  return (
    <div className="app-shell flex h-[100dvh] min-h-0 w-full overflow-hidden" style={{ minHeight: 0 }}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => {
          setSidebarCollapsed(c => {
            const next = !c;
            try {
              localStorage.setItem('sidebarCollapsed', next ? 'true' : 'false');
            } catch { }
            return next;
          });
        }}
      />
      <div
        className={isDashboard ? 'main-content' : 'main-content ref-skin'}
        style={{
          marginLeft: contentMargin,
          transition: 'margin-left 0.32s ease',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg)',
          color: 'var(--text)',
        }}
      >
        <BillingWallBanner />
        <div className="page-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', overflowY: 'auto', padding: '20px 24px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try {
      const stored = localStorage.getItem('sidebarCollapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  return (
    <NotificationProvider>
      <LoadingProvider>
        <ConfirmProvider>
          <UniboxNotificationsProvider>
            <AppModeProvider>
              <OnboardingProvider>
                <Onboarding />
                <LayoutInner
                  sidebarCollapsed={sidebarCollapsed}
                  setSidebarCollapsed={setSidebarCollapsed}
                >
                  {children}
                </LayoutInner>
              </OnboardingProvider>
            </AppModeProvider>
          </UniboxNotificationsProvider>
        </ConfirmProvider>
      </LoadingProvider>
    </NotificationProvider>
  );
}