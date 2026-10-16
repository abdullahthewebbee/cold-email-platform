import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Campaigns from './pages/Campaigns';
import AddCampaign from './pages/AddCampaign';
import CampaignDetail from './pages/CampaignDetail';
import Inboxes from './pages/Inboxes';
import Schedule from './pages/Schedule';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Unibox from './pages/Unibox';
import DeliverabilityTips from './pages/DeliverabilityTips';
import SystemHealth from './pages/SystemHealth';
import DnsDoctor from './pages/DnsDoctor';
import Leads from './pages/Leads';
import Suppression from './pages/Suppression';
import LeadDetail from './pages/LeadDetail';
import Notifications from './pages/Notifications';
import Login from './pages/Login';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import Feedback from './pages/Feedback';
import DoneForYou from './pages/DoneForYou';
import Visitors from './pages/Visitors';
import './index.css';
import './do-compat.css';   // ← must be second
import './styles/aegis.css';                // Aegis design system (tokens + components)
import './styles/inboxair-theme.css';       // bridge: InboxAir + --do-* tokens -> Aegis
import './styles/inboxair-components.css';  // InboxAir component looks
import './styles/inboxair-density.css';     // InboxAir density + proportions (last)
import './styles/ref-skin.css';
import { api } from './api';
import { AuthProvider, useAuth } from './context/AuthContext';
import SplashScreen from './components/SplashScreen';
import { DarkModeProvider } from './context/DarkModeContext';
import { SystemHealthProvider } from './context/SystemHealthContext';
import { NotificationsProvider } from './context/NotificationsContext';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <SplashScreen />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // Browser tab title (index.html may still say DevOutreach)
  useEffect(() => { document.title = 'InboxAir'; }, []);

  // Register this browser's IP as a known IP (auto-expires after 1 week)
  useEffect(() => {
    if (user) {
      api.post('/settings/known-ips/heartbeat', {}).catch(() => {});
    }
  }, [user]);

  // Identify logged-in user to Crisp so support conversations show name/email
  useEffect(() => {
    if (user && window.$crisp) {
      window.$crisp.push(["set", "user:email", [user.email]]);
      window.$crisp.push(["set", "user:nickname", [user.username]]);
    }
  }, [user]);

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to="/" replace /> : <Login />
      } />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Analytics />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/campaigns/add" element={<AddCampaign />} />
              <Route path="/campaigns/:id" element={<CampaignDetail />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/suppression" element={<Suppression />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              <Route path="/inboxes" element={<Inboxes />} />
              <Route path="/unibox" element={<Unibox />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/deliverability-tips" element={<DeliverabilityTips />} />
              <Route path="/system-health" element={<SystemHealth />} />
              <Route path="/dns-doctor" element={<DnsDoctor />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/done-for-you" element={<DoneForYou />} />
              <Route path="/visitors" element={<Visitors />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <DarkModeProvider>
      <AuthProvider>
        <SystemHealthProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </SystemHealthProvider>
      </AuthProvider>
    </DarkModeProvider>
  );
}
