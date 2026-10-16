import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { api, apiCache, postJsonForDownload } from '../api';
import { useDarkMode } from '../context/DarkModeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useNotify } from '../context/NotificationContext';
import { useAppMode } from '../context/AppModeContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { Card } from '../components/ui/Card';
import EmailVerificationSettings from '../components/EmailVerificationSettings';
import BillingTab from '../components/BillingTab';
import InviteTeamMember from '../components/InviteTeamMember';
import TeamMembersList from '../components/TeamMembersList';
import Icon from '../components/ui/AegisIcon';

const SETTINGS_TABS = [
  { id: 'general', label: 'General' },
  { id: 'setup', label: 'Setup' },
  { id: 'features', label: 'Features' },
  { id: 'integrating', label: 'Integrating' },
  { id: 'dev', label: 'Dev' },
  { id: 'billing', label: 'Billing' },
];

const SECTIONS_BY_TAB = {
  general: [
    { id: 'invite', label: 'Invite Team' },
    { id: 'scheduling', label: 'Scheduling' },
    { id: 'email-verification', label: 'Email Verification' },
    { id: 'account', label: 'Account & Security' },
    { id: 'danger-zone', label: 'Danger Zone' },
    { id: 'known-ips', label: 'Known IPs' },
  ],
  setup: [
    { id: 'gmail-sync', label: 'Gmail sync' },
    { id: 'backup-restore', label: 'Backup & restore' },
  ],
  features: [
    { id: 'campaign-modes', label: 'Campaign Modes' },
    { id: 'other', label: 'Other' },
  ],
  integrating: [
    { id: 'api-keys', label: 'API keys' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'mcp', label: 'MCP' },
  ],
  dev: [{ id: 'test-mode', label: 'Test mode' }],
  billing: [{ id: 'billing-plan', label: 'Plan & Subscription' }],
};

/* ── scoped styles ─────────────────────────────────────────────────────────── */
const CSS = `
.st-hero {
  background: var(--gold-dim);
  padding: 2rem 2rem 0;
  position: relative;
}
.st-hero-eyebrow {
  font-family: var(--font-ui);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 0.4rem;
}
.st-hero-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 0.25rem;
}
.st-tab-nav {
  display: flex;
  gap: 0;
  margin-top: 1.25rem;
  border-bottom: 1px solid var(--border);
}
.st-tab-btn {
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.55rem 1.1rem;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
  margin-bottom: -1px;
}
.st-tab-btn:hover { color: var(--text); }
.st-tab-btn.active {
  color: var(--gold);
  border-bottom-color: var(--do-gold);
}
.st-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.st-sidebar {
  width: 160px;
  flex-shrink: 0;
  border-right: 1px solid var(--do-border);
  padding: 1rem 0;
  overflow-y: auto;
}
.st-sidebar-item {
  display: block;
  width: 100%;
  text-align: left;
  font-size: 0.78rem;
  padding: 0.45rem 1rem;
  color: var(--do-text-muted);
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.st-sidebar-item:hover { color: var(--do-text); background: var(--do-hover); }
.st-sidebar-item.active {
  background: var(--do-gold-bg);
  color: var(--do-gold-dark);
  border-left-color: var(--do-gold);
  font-weight: 600;
}
.st-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.75rem 2rem;
  min-height: 0;
}
.st-section { margin-bottom: 2.5rem; }
.st-section-title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--do-text);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--do-border);
}
.st-field-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--do-text-muted);
  margin-bottom: 0.35rem;
}
.st-input {
  width: 100%;
  max-width: 24rem;
  border: 1px solid var(--do-border);
  border-radius: 0.4rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  background: var(--do-surface);
  color: var(--do-text);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.st-input:focus {
  outline: none;
  border-color: var(--do-gold);
  box-shadow: 0 0 0 2px rgba(201,168,76,0.18);
}
.st-input-mono {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.82rem;
}
.st-danger-box {
  border: 1px solid var(--danger-line);
  border-radius: 0.5rem;
  padding: 1rem;
  background: var(--danger-dim);
}
.dark .st-danger-box { background: rgba(220,38,38,0.07); border-color: rgba(220,38,38,0.35); }
.st-toggle {
  position: relative;
  width: 2.75rem;
  height: 1.5rem;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.st-toggle.on { background: var(--do-gold-dark); }
.st-toggle.off { background: var(--do-border); }
.st-toggle-knob {
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: var(--bg-elevated);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s;
}
.st-toggle.on .st-toggle-knob { transform: translateX(1.25rem); }
.st-mode-card {
  border: 2px solid var(--do-border);
  border-radius: 0.75rem;
  overflow: hidden;
  margin-bottom: 0.75rem;
  background: var(--do-surface);
}
.st-mode-card.manual { border-color: var(--text-dim); }
.st-mode-card.semi_manual { border-color: var(--do-gold); }
.st-mode-card.full_ai { border-color: var(--info); }
.st-mode-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}
.st-mode-body {
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--do-border);
}
.st-pill {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.68rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.st-pill-gold { background: var(--do-gold-bg); color: var(--do-gold-dark); }
.st-pill-active { background: var(--do-gold-dark); color: var(--on-gold); }
.st-pill-purple { background: var(--info-dim); color: var(--info); }
.st-code-input {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.8rem;
  border-radius: 0.4rem;
  padding: 0.3rem 0.65rem;
  width: 7rem;
  border: 2px solid;
  background: var(--do-surface);
  color: var(--do-text);
}
.st-code-input:focus { outline: none; }
.st-code-input.manual { border-color: var(--text-dim); }
.st-code-input.semi_manual { border-color: var(--do-gold); }
.st-code-input.full_ai { border-color: var(--info); }
.st-apikey-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--do-border);
}
.st-wh-row {
  border: 1px solid var(--do-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 0.6rem;
  background: var(--do-surface);
}
.st-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.st-dialog {
  background: var(--do-surface);
  border-radius: 0.75rem;
  max-width: 38rem;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}
.st-mcp-block {
  background: var(--do-cream);
  border: 1px solid var(--do-border);
  border-radius: 0.5rem;
  padding: 1rem;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--do-text);
}
`;

/* ── sub-components ────────────────────────────────────────────────────────── */

function ProfileEditSection({ user }) {
  const notify = useNotify();
  const [username, setUsername] = useState(user?.username || '');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!username.trim() || username === user?.username) return;
    setSaving(true);
    try {
      await api.patch('/auth/me', { username: username.trim() });
      notify({ type: 'success', message: 'Username updated' });
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--do-text)' }}>Profile</p>
      <div>
        <label className="st-field-label">Username</label>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="st-input" />
      </div>
      <div>
        <button
          type="submit"
          className="do-btn-outline"
          disabled={saving || !username.trim() || username === user?.username}
          style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
        >
          {saving ? 'Saving…' : 'Save username'}
        </button>
      </div>
    </form>
  );
}

function ChangePasswordSection({ user }) {
  const notify = useNotify();
  const hasPassword = !!user?.has_password;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      notify({ type: 'success', message: hasPassword ? 'Password changed' : 'Password set — you can now sign in with a username & password too' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--do-text)' }}>{hasPassword ? 'Change Password' : 'Set a Password'}</p>
      {!hasPassword && (
        <p style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)' }}>Your account was created with Google/Microsoft sign-in and has no password yet. Set one here to also be able to sign in with a username &amp; password.</p>
      )}
      {hasPassword && (
        <div>
          <label className="st-field-label">Current password</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="st-input" />
        </div>
      )}
      <div>
        <label className="st-field-label">New password</label>
        <input type="password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="st-input" />
      </div>
      <div>
        <button
          type="submit"
          className="do-btn-outline"
          disabled={saving || (hasPassword && !currentPassword) || newPassword.length < 8}
          style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
        >
          {saving ? 'Saving…' : (hasPassword ? 'Change password' : 'Set password')}
        </button>
      </div>
    </form>
  );
}

function DeleteAccountSection() {
  const notify = useNotify();
  const [confirmText, setConfirmText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setBusy(true);
    try {
      await api.del(`/auth/me?confirm=DELETE`);
      notify({ type: 'success', message: 'Account deleted' });
      window.location.href = '/login';
    } catch (err) {
      notify({ type: 'error', message: err.message });
      setBusy(false);
    }
  };

  if (!showConfirm) {
    return (
      <div className="st-danger-box">
        <p style={{ fontSize: '0.82rem', color: 'var(--do-text)', marginBottom: '0.75rem' }}>
          Permanently delete your account and all associated data (campaigns, leads, inboxes, connected email accounts). If you're the only member of your organization, all organization data is deleted too. This cannot be undone.
        </p>
        <button
          className="do-btn-outline"
          onClick={() => setShowConfirm(true)}
          style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div className="st-danger-box" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--danger)' }}>
        This is permanent. Type <code style={{ background: 'var(--danger-dim)', padding: '0 0.3rem', borderRadius: '0.25rem' }}>DELETE</code> to confirm.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={e => setConfirmText(e.target.value)}
        placeholder="Type DELETE"
        className="st-input"
        style={{ maxWidth: '16rem', borderColor: 'var(--danger-line)' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="do-btn-outline"
          onClick={handleDelete}
          disabled={confirmText !== 'DELETE' || busy}
          style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          {busy ? 'Deleting…' : 'Permanently delete my account'}
        </button>
        <button
          className="do-btn-outline"
          onClick={() => { setShowConfirm(false); setConfirmText(''); }}
          style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CampaignModeCodes() {
  const notify = useNotify();
  const [codes, setCodes] = useState({ manual: '', semi_manual: '', full_ai: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [credits, setCredits] = useState(null);
  const [modelSaving, setModelSaving] = useState(false);
  const [activeMode, setActiveMode] = useState(null);
  const [modeActivating, setModeActivating] = useState(false);

  const MODEL_LABELS = {
    deepseek: { name: 'DeepSeek V3 Flash', sub: 'Fast & optimized for cold email', cost: '1 cr/op' },
  };

  useEffect(() => {
    api.get('/settings/campaign-mode-codes').then(d => setCodes(d)).catch(() => {});
    api.get('/credits/balance').then(d => setCredits(d)).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/settings/campaign-mode-codes', codes);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch(e) {}
    finally { setSaving(false); }
  };

  const activateMode = async (modeKey) => {
    const newActive = activeMode === modeKey ? null : modeKey;
    setModeActivating(true);
    try {
      if (newActive) {
        if (activeMode && activeMode !== 'manual') {
          await api.post('/settings/activate-mode', { mode: activeMode, active: false });
        }
        await api.post('/settings/activate-mode', { mode: newActive, active: newActive !== 'manual' });
        setActiveMode(newActive);
        notify(`${newActive.replace('_', ' ')} mode activated`, 'success');
      } else {
        await api.post('/settings/activate-mode', { mode: modeKey, active: false });
        setActiveMode(null);
        notify('Mode deactivated', 'success');
      }
    } catch { notify('Failed to activate mode', 'error'); }
    finally { setModeActivating(false); }
  };

  const saveModel = async (mode, model) => {
    setModelSaving(true);
    try {
      await api.post('/credits/model', { model, mode });
      setCredits(prev => ({ ...prev, [`${mode}_model`]: model }));
      notify('Model saved', 'success');
    } catch { notify('Failed to save model', 'error'); }
    finally { setModelSaving(false); }
  };

  const MODELS = ['gemini', 'deepseek', 'claude'];

  const MODES = [
    {
      key: 'manual',
      label: 'Manual',
      desc: 'You build sequences and branch trees yourself. Full control over every step and follow-up.',
      hasAI: false,
      features: ['Branch-tree sequences','A/B variant testing','Full queue control','Open/click/reply tracking','Lead personalization fields'],
    },
    {
      key: 'semi_manual',
      label: 'Semi-Manual AI',
      desc: 'Write Step 1 only. AI reads every reply and auto-drafts the next response for your review.',
      hasAI: true,
      modelKey: 'semi_manual_model',
      features: ['Everything in Manual','AI reply interest classifier','AI reply draft assistant','Human review before sending'],
    },
    {
      key: 'full_ai',
      label: 'Full AI',
      desc: 'No sequences, no branch tree. AI writes first-touch emails and handles all replies end-to-end.',
      hasAI: true,
      modelKey: 'full_ai_model',
      features: ['Everything in Semi-Manual AI','AI first-touch email drafting','Deep personalization engine','AI sequence generator','Auto-send replies (optional)'],
    },
  ];

  return (
    <div>
      <p style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)', marginBottom: '1rem' }}>
        Choose how your campaigns operate. Each mode uses different AI features. Set codes below — users paste these when creating a campaign.
      </p>

      {MODES.map(mode => (
        <div key={mode.key} className={`st-mode-card ${mode.key}`}>
          <button
            className="st-mode-header"
            onClick={() => setExpanded(expanded === mode.key ? null : mode.key)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--do-text)' }}>{mode.label}</span>
              {activeMode === mode.key && <span className="st-pill st-pill-active">Active</span>}
              {mode.hasAI && credits?.[mode.modelKey] && MODEL_LABELS[credits[mode.modelKey]]?.name && (
                <span className="st-pill st-pill-gold">{MODEL_LABELS[credits[mode.modelKey]]?.name}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }} onClick={e => e.stopPropagation()}>
              <button
                disabled={modeActivating}
                onClick={() => activateMode(mode.key)}
                className={`toggle${activeMode === mode.key ? ' on' : ''}`}
                style={{ opacity: modeActivating ? 0.5 : 1 }}
              >
              </button>
              <input
                type="text"
                value={codes[mode.key] || ''}
                onChange={e => { e.stopPropagation(); setCodes(c => ({ ...c, [mode.key]: e.target.value.toUpperCase() })); }}
                onClick={e => e.stopPropagation()}
                className={`st-code-input ${mode.key}`}
                placeholder="e.g. SEMI-2024"
              />
              <span style={{ color: 'var(--do-text-muted)', fontSize: '0.75rem' }}>
                <Icon name={expanded === mode.key ? 'chevron-up' : 'chevron-down'} size={16} />
              </span>
            </div>
          </button>

          {expanded === mode.key && (
            <div className="st-mode-body">
              <p style={{ fontSize: '0.82rem', color: 'var(--do-text-muted)', marginBottom: '0.75rem' }}>{mode.desc}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {mode.features.map(f => (
                  <li key={f} style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span style={{ color: 'var(--gold-dark)' }}><Icon name="check" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} /></span>{f}
                  </li>
                ))}
              </ul>
              {!mode.hasAI ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--do-text-muted)', fontStyle: 'italic' }}>No AI credits required for Manual mode.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--do-gold-bg)', background: 'var(--do-gold-bg)' }}>
                    <span><Icon name="cpu" size={16} /></span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--do-text-muted)' }}>AI handles all email writing automatically. 1 credit per operation.</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)' }}>Current balance</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--do-gold-dark)' }}>
                      {credits?.is_unlimited ? 'Unlimited' : `${(credits?.credits_remaining || 0).toLocaleString()} credits`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: '1rem' }}>
        <button className="do-btn-gold" onClick={save} disabled={saving} style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem' }}>
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save codes'}
        </button>
      </div>
    </div>
  );
}

/* ── main component ────────────────────────────────────────────────────────── */

export default function Settings() {
  const { user } = useAuth();
  const notify = useNotify();
  const confirm = useConfirm();
  const { darkMode } = useDarkMode();
  const { appMode } = useAppMode();

  /* ── state ── */
  const [strategy, setStrategy] = useState('time_based');
  const [testMode, setTestMode] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [mcpSetup, setMcpSetup] = useState(null);
  const [notifConfig, setNotifConfig] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [newWh, setNewWh] = useState({ url: '', description: '', events: [] });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [aiFeatures, setAiFeatures] = useState({});
  const [aiCredits, setAiCredits] = useState(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiProviders, setAiProviders] = useState([]);
  const [aiModels, setAiModels] = useState([]);
  const [aiProviderSearch, setAiProviderSearch] = useState('');
  const [aiModelSearch, setAiModelSearch] = useState('');
  const [aiVerifying, setAiVerifying] = useState(false);
  const [aiVerifyResult, setAiVerifyResult] = useState(null);
  const [testEventWh, setTestEventWh] = useState('');
  const [testEventType, setTestEventType] = useState('');
  const [testEventResult, setTestEventResult] = useState(null);
  const [gmailSync, setGmailSync] = useState({ pubsub_topic: '', webhook_token: '', polling_interval_minutes: 5 });
  const [gmailSyncSaving, setGmailSyncSaving] = useState(false);
  const [backupCfg, setBackupCfg] = useState(null);
  const [backupMeta, setBackupMeta] = useState(null);
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupDownloadBusy, setBackupDownloadBusy] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreFileKey, setRestoreFileKey] = useState(0);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreMeta, setRestoreMeta] = useState(null);
  const [restoreMetaBusy, setRestoreMetaBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restorePreviewBusy, setRestorePreviewBusy] = useState(false);
  const [restoreExecuteBusy, setRestoreExecuteBusy] = useState(false);
  const [knownIps, setKnownIps] = useState([]);
  const [knownIpsOpen, setKnownIpsOpen] = useState(false);
  const [currentIp, setCurrentIp] = useState('');
  const [newIpAddress, setNewIpAddress] = useState('');
  const [activeTab, setActiveTab] = useState('general');
  const tabContentRef = useRef(null);
  const [activeSectionDomId, setActiveSectionDomId] = useState('settings-invite');

  /* ── load ── */
  const loadAll = useCallback(async () => {
    try {
      const [strat, tm, whs, evts, ai, prov, ips, keys, notif, gs, mcp] = await Promise.allSettled([
        api.get('/settings/scheduling-strategy'),
        api.get('/settings/test-mode'),
        api.get('/webhooks'),
        api.get('/webhooks/event-types'),
        api.get('/settings/ai'),
        api.get('/settings/ai/providers'),
        api.get('/settings/known-ips'),
        api.get('/api-keys'),
        api.get('/settings/notifications'),
        api.get('/settings/gmail-sync'),
        api.get('/settings/mcp-setup'),
      ]);
      if (strat.status === 'fulfilled') setStrategy(strat.value?.strategy || 'time_based');
      if (tm.status === 'fulfilled') setTestMode(tm.value?.enabled ?? false);
      if (whs.status === 'fulfilled') setWebhooks(whs.value || []);
      if (evts.status === 'fulfilled') setEventTypes(evts.value || []);
      if (ai.status === 'fulfilled') setAiFeatures(ai.value || {});
      if (prov.status === 'fulfilled') { setAiProviders(prov.value?.providers || []); setAiModels(prov.value?.models || []); }
      if (ips.status === 'fulfilled') { setKnownIps(ips.value?.ips || []); setCurrentIp(ips.value?.current_ip || ''); }
      if (keys.status === 'fulfilled') setApiKeys(keys.value || []);
      if (notif.status === 'fulfilled') setNotifConfig(notif.value);
      if (gs.status === 'fulfilled') setGmailSync(gs.value || {});
      if (mcp.status === 'fulfilled') setMcpSetup(mcp.value);

      if (user?.is_admin) {
        const bc = await api.get('/admin/backup/config').catch(() => null);
        if (bc) setBackupCfg(bc);
        const bm = await api.get('/admin/backup/meta').catch(() => null);
        if (bm) setBackupMeta(bm);
      }
    } catch {}
  }, [user?.is_admin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── scroll-spy ── */
  const scrollToSection = useCallback((domId) => {
    const el = tabContentRef.current?.querySelector(`#${domId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const el = tabContentRef.current;
    if (!el) return;
    const onScroll = () => {
      const sections = SECTIONS_BY_TAB[activeTab] || [];
      for (let i = sections.length - 1; i >= 0; i--) {
        const s = el.querySelector(`#settings-${sections[i].id}`);
        if (s && s.getBoundingClientRect().top - el.getBoundingClientRect().top <= 48) {
          setActiveSectionDomId(`settings-${sections[i].id}`);
          return;
        }
      }
      if (sections[0]) setActiveSectionDomId(`settings-${sections[0].id}`);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [activeTab]);

  /* ── helpers ── */
  const saveStrategy = async (val) => {
    setStrategy(val);
    try { await api.post('/settings/scheduling-strategy', { strategy: val }); }
    catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const saveGmailSync = async (e) => {
    e.preventDefault();
    setGmailSyncSaving(true);
    try {
      await api.post('/settings/gmail-sync', gmailSync);
      notify({ type: 'success', message: 'Gmail sync settings saved' });
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setGmailSyncSaving(false); }
  };

  const saveBackupCfg = async (e) => {
    e.preventDefault();
    setBackupSaving(true);
    try {
      await api.post('/admin/backup/config', backupCfg);
      notify({ type: 'success', message: 'Backup configuration saved' });
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setBackupSaving(false); }
  };

  const runBackup = async () => {
    setBackupRunning(true);
    try {
      await api.post('/admin/backup/run', {});
      notify({ type: 'success', message: 'Backup started' });
      setTimeout(async () => {
        const bm = await api.get('/admin/backup/meta').catch(() => null);
        if (bm) setBackupMeta(bm);
      }, 3000);
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setBackupRunning(false); }
  };

  const downloadBackup = async () => {
    setBackupDownloadBusy(true);
    try { await postJsonForDownload('/admin/backup/download', {}); }
    catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setBackupDownloadBusy(false); }
  };

  const loadRestoreMeta = async () => {
    if (!restoreFile) return;
    setRestoreMetaBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', restoreFile);
      if (restorePassword) fd.append('password', restorePassword);
      const m = await api.postForm('/admin/backup/restore/meta', fd);
      setRestoreMeta(m);
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setRestoreMetaBusy(false); }
  };

  const loadRestorePreview = async () => {
    if (!restoreFile) return;
    setRestorePreviewBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', restoreFile);
      if (restorePassword) fd.append('password', restorePassword);
      const p = await api.postForm('/admin/backup/restore/preview', fd);
      setRestorePreview(p);
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setRestorePreviewBusy(false); }
  };

  const executeRestore = async () => {
    if (!restoreFile) return;
    const ok = await confirm('This will overwrite current data with the backup. Continue?');
    if (!ok) return;
    setRestoreExecuteBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', restoreFile);
      if (restorePassword) fd.append('password', restorePassword);
      await api.postForm('/admin/backup/restore/execute', fd);
      notify({ type: 'success', message: 'Restore completed' });
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setRestoreExecuteBusy(false); }
  };

  const createApiKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    try {
      const r = await api.post('/api-keys', { name: newKeyName.trim(), expires_at: newKeyExpiry || null });
      setCreatedKey(r);
      setNewKeyName('');
      setNewKeyExpiry('');
      loadAll();
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const revokeApiKey = async (id) => {
    if (!await confirm('Revoke this API key?')) return;
    try {
      await api.del(`/api-keys/${id}`);
      setApiKeys(k => k.filter(x => x.id !== id));
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const createWebhook = async (e) => {
    e.preventDefault();
    if (!newWh.url) return;
    try {
      const r = await api.post('/webhooks', newWh);
      setWebhooks(w => [...w, r]);
      setNewWh({ url: '', description: '', events: [] });
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const deleteWebhook = async (id) => {
    if (!await confirm('Delete this webhook?')) return;
    try {
      await api.del(`/webhooks/${id}`);
      setWebhooks(w => w.filter(x => x.id !== id));
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const saveWebhook = async (id) => {
    try {
      const r = await api.patch(`/webhooks/${id}`, editForm);
      setWebhooks(w => w.map(x => x.id === id ? r : x));
      setEditingId(null);
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const testWebhookEvent = async () => {
    if (!testEventWh || !testEventType) return;
    try {
      const r = await api.post(`/webhooks/${testEventWh}/test`, { event_type: testEventType });
      setTestEventResult(r);
    } catch (err) { setTestEventResult({ error: err.message }); }
  };

  const addKnownIp = async (e) => {
    e.preventDefault();
    if (!newIpAddress.trim()) return;
    try {
      const r = await api.post('/settings/known-ips', { ip: newIpAddress.trim() });
      setKnownIps(r.ips || []);
      setNewIpAddress('');
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const removeKnownIp = async (ip) => {
    try {
      const r = await api.del(`/settings/known-ips/${encodeURIComponent(ip)}`);
      setKnownIps(r.ips || []);
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  /* ── EventSelector ── */
  const EventSelector = useCallback(({ value, onChange }) => {
    const EMAIL_EVENTS = eventTypes.filter(e => e.startsWith('email.'));
    const LEAD_EVENTS = eventTypes.filter(e => e.startsWith('lead.'));
    const SYSTEM_EVENTS = eventTypes.filter(e => !e.startsWith('email.') && !e.startsWith('lead.'));

    const allSelected = eventTypes.length > 0 && value.length === eventTypes.length;
    const specificMode = !allSelected || value.length < eventTypes.length;

    const toggleGroup = (group) => {
      const allIn = group.every(e => value.includes(e));
      if (allIn) onChange(value.filter(e => !group.includes(e)));
      else onChange([...new Set([...value, ...group])]);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <button
            type="button"
            onClick={() => onChange(eventTypes)}
            className={`st-pill ${!specificMode ? 'st-pill-gold' : ''}`}
            style={{ border: '1px solid var(--do-border)', cursor: 'pointer', background: !specificMode ? undefined : 'transparent' }}
          >
            All Events
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className={`st-pill ${specificMode ? 'st-pill-gold' : ''}`}
            style={{ border: '1px solid var(--do-border)', cursor: 'pointer', background: specificMode ? undefined : 'transparent' }}
          >
            Specific
          </button>
        </div>
        {specificMode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[['Email', EMAIL_EVENTS], ['Lead', LEAD_EVENTS], ['System', SYSTEM_EVENTS]].map(([group, evts]) => (
              evts.length > 0 && (
                <div key={group}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--do-text-muted)', marginBottom: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={evts.every(e => value.includes(e))}
                      ref={el => { if (el) el.indeterminate = evts.some(e => value.includes(e)) && !evts.every(e => value.includes(e)); }}
                      onChange={() => toggleGroup(evts)}
                    />
                    {group} Events
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', paddingLeft: '1.25rem' }}>
                    {evts.map(ev => (
                      <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={value.includes(ev)}
                          onChange={e => {
                            if (e.target.checked) onChange([...value, ev]);
                            else onChange(value.filter(x => x !== ev));
                          }}
                        />
                        <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', color: 'var(--do-text)' }}>{ev}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    );
  }, [eventTypes]);

  const sections = SECTIONS_BY_TAB[activeTab] || [];
  const mcpEndpoint = mcpSetup?.endpoint || '';
  const mcpTools = mcpSetup?.tools || [];
  const mcpCursorFragment = (mcpSetup?.cursor_fragment || '').replace(/devoutreach/g, 'inboxair').replace(/DEVOUTREACH/g, 'INBOXAIR');

  /* ── render ── */
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* Hero */}
      <div className="st-hero">
        <div className="st-hero-eyebrow">InboxAir / Settings</div>
        <h1 className="st-hero-title">Settings</h1>
        <nav className="st-tab-nav">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`st-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab.id); setActiveSectionDomId(`settings-${(SECTIONS_BY_TAB[tab.id] || [])[0]?.id}`); if (tabContentRef.current) tabContentRef.current.scrollTop = 0; }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="st-layout">
        {/* Sidebar */}
        <aside className="st-sidebar">
          {sections.map(sec => (
            <button
              key={sec.id}
              className={`st-sidebar-item ${activeSectionDomId === `settings-${sec.id}` ? 'active' : ''}`}
              onClick={() => scrollToSection(`settings-${sec.id}`)}
            >
              {sec.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="st-content" ref={tabContentRef}>

          {/* ── GENERAL ── */}
          {activeTab === 'general' && (
            <>
              <section className="st-section" id="settings-invite">
                <h2 className="st-section-title">Invite Team</h2>
                <InviteTeamMember />
                <TeamMembersList />
              </section>

              <section className="st-section" id="settings-scheduling">
                <h2 className="st-section-title">Scheduling</h2>
                <div className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { value: 'time_based', label: 'Time-based', desc: 'Send emails at a set time each day.' },
                    { value: 'interval_based', label: 'Interval-based', desc: 'Spread sends evenly across the day.' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="strategy"
                        value={opt.value}
                        checked={strategy === opt.value}
                        onChange={() => saveStrategy(opt.value)}
                        style={{ marginTop: '0.15rem', accentColor: 'var(--do-gold-dark)' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--do-text)' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--do-text-muted)' }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <section className="st-section" id="settings-email-verification">
                <h2 className="st-section-title">Email Verification</h2>
                <EmailVerificationSettings />
              </section>

              <section className="st-section" id="settings-account">
                <h2 className="st-section-title">Account & Security</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <ProfileEditSection user={user} />
                  <ChangePasswordSection user={user} />
                  <div className="do-card" style={{ padding: '1rem' }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--do-text)', marginBottom: '0.5rem' }}>Session</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)', marginBottom: '0.75rem' }}>Signed in as <strong>{user?.email}</strong></p>
                    <button
                      className="do-btn-outline"
                      style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
                      onClick={async () => { await api.post('/auth/logout', {}); window.location.href = '/login'; }}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </section>

              <section className="st-section" id="settings-danger-zone">
                <h2 className="st-section-title" style={{ color: 'var(--danger)' }}>Danger Zone</h2>
                <DeleteAccountSection />
              </section>

              <section className="st-section" id="settings-known-ips">
                <h2 className="st-section-title">Known IPs</h2>
                <div className="do-card" style={{ padding: '1rem' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)', marginBottom: '0.75rem' }}>
                    Restrict access to specific IP addresses. Your current IP: <code style={{ fontFamily: 'ui-monospace, Consolas, monospace', background: 'var(--do-cream)', padding: '0 0.3rem', borderRadius: '0.2rem' }}>{currentIp}</code>
                  </p>
                  <button className="do-btn-gold" onClick={() => setKnownIpsOpen(true)} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                    Manage Known IPs ({knownIps.length})
                  </button>
                </div>
              </section>
            </>
          )}

          {/* ── SETUP ── */}
          {activeTab === 'setup' && (
            <>
              <section className="st-section" id="settings-gmail-sync">
                <h2 className="st-section-title">Gmail Sync</h2>
                <form onSubmit={saveGmailSync} className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div>
                    <label className="st-field-label">Pub/Sub Topic</label>
                    <input
                      className="st-input st-input-mono"
                      value={gmailSync.pubsub_topic || ''}
                      onChange={e => setGmailSync(g => ({ ...g, pubsub_topic: e.target.value }))}
                      placeholder="projects/my-project/topics/gmail"
                    />
                  </div>
                  <div>
                    <label className="st-field-label">Webhook Token</label>
                    <input
                      className="st-input st-input-mono"
                      value={gmailSync.webhook_token || ''}
                      onChange={e => setGmailSync(g => ({ ...g, webhook_token: e.target.value }))}
                      placeholder="secret-token"
                    />
                  </div>
                  <div>
                    <label className="st-field-label">Polling Interval (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      className="st-input"
                      style={{ maxWidth: '8rem' }}
                      value={gmailSync.polling_interval_minutes || 5}
                      onChange={e => setGmailSync(g => ({ ...g, polling_interval_minutes: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <button type="submit" className="do-btn-gold" disabled={gmailSyncSaving} style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem' }}>
                      {gmailSyncSaving ? 'Saving…' : 'Save Gmail Sync'}
                    </button>
                  </div>
                </form>
              </section>

              {user?.is_admin && (
                <section className="st-section" id="settings-backup-restore">
                  <h2 className="st-section-title">Backup & Restore</h2>

                  {/* Backup config */}
                  {backupCfg && (
                    <form onSubmit={saveBackupCfg} className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1rem' }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--do-text)' }}>Backup Configuration</p>
                      <div>
                        <label className="st-field-label">Encryption password</label>
                        <input
                          type="password"
                          className="st-input"
                          value={backupCfg.encryption_password || ''}
                          onChange={e => setBackupCfg(c => ({ ...c, encryption_password: e.target.value }))}
                          placeholder="Leave blank for no encryption"
                        />
                      </div>
                      <div>
                        <label className="st-field-label">Schedule (cron)</label>
                        <input
                          className="st-input st-input-mono"
                          value={backupCfg.schedule || ''}
                          onChange={e => setBackupCfg(c => ({ ...c, schedule: e.target.value }))}
                          placeholder="0 2 * * *"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button type="submit" className="do-btn-gold" disabled={backupSaving} style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem' }}>
                          {backupSaving ? 'Saving…' : 'Save config'}
                        </button>
                        {backupMeta?.last_backup_at && (
                          <button type="button" className="do-btn-outline" onClick={downloadBackup} disabled={backupDownloadBusy} style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem' }}>
                            {backupDownloadBusy ? 'Downloading…' : `Download backup (${new Date(backupMeta.last_backup_at).toLocaleDateString()})`}
                          </button>
                        )}
                        <button type="button" className="do-btn-outline" onClick={runBackup} disabled={backupRunning} style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem' }}>
                          {backupRunning ? 'Running…' : 'Run backup now'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Restore wizard */}
                  <div className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--do-text)' }}>Restore from backup</p>
                    <div>
                      <label className="st-field-label">Backup file</label>
                      <FileUploadArea
                        key={restoreFileKey}
                        accept=".zip,.enc"
                        onFile={f => { setRestoreFile(f); setRestoreMeta(null); setRestorePreview(null); }}
                      />
                    </div>
                    {restoreFile && (
                      <>
                        <div>
                          <label className="st-field-label">Decryption password (if encrypted)</label>
                          <input
                            type="password"
                            className="st-input"
                            value={restorePassword}
                            onChange={e => setRestorePassword(e.target.value)}
                            placeholder="Leave blank if not encrypted"
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button className="do-btn-outline" onClick={loadRestoreMeta} disabled={restoreMetaBusy} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                            {restoreMetaBusy ? 'Loading…' : 'Load info'}
                          </button>
                          <button className="do-btn-outline" onClick={loadRestorePreview} disabled={restorePreviewBusy} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                            {restorePreviewBusy ? 'Loading…' : 'Preview'}
                          </button>
                          <button className="do-btn-gold" onClick={executeRestore} disabled={restoreExecuteBusy} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                            {restoreExecuteBusy ? 'Restoring…' : 'Execute restore'}
                          </button>
                        </div>
                        {restoreMeta && (
                          <div className="st-mcp-block" style={{ fontSize: '0.75rem' }}>
                            {JSON.stringify(restoreMeta, null, 2)}
                          </div>
                        )}
                        {restorePreview && (
                          <div className="st-mcp-block" style={{ fontSize: '0.75rem' }}>
                            {JSON.stringify(restorePreview, null, 2)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ── FEATURES ── */}
          {activeTab === 'features' && (
            <>
              <section className="st-section" id="settings-campaign-modes">
                <h2 className="st-section-title">Campaign Modes</h2>
                <CampaignModeCodes />
              </section>

              <section className="st-section" id="settings-other">
                <h2 className="st-section-title">Other</h2>
                <div className="do-card" style={{ padding: '1rem' }}>
                  <a href="/notifications" style={{ fontSize: '0.85rem', color: 'var(--do-gold-dark)', textDecoration: 'none', fontWeight: 600 }}>
                    Notification settings →
                  </a>
                </div>
              </section>
            </>
          )}

          {/* ── INTEGRATING ── */}
          {activeTab === 'integrating' && (
            <>
              {/* API Keys */}
              <section className="st-section" id="settings-api-keys">
                <h2 className="st-section-title">API Keys</h2>
                <div className="do-card" style={{ padding: '1rem' }}>
                  <form onSubmit={createApiKey} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
                    <div>
                      <label className="st-field-label">Key name</label>
                      <input
                        className="st-input"
                        style={{ maxWidth: '14rem' }}
                        value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        placeholder="My integration"
                      />
                    </div>
                    <div>
                      <label className="st-field-label">Expires (optional)</label>
                      <input
                        type="date"
                        className="st-input"
                        style={{ maxWidth: '10rem' }}
                        value={newKeyExpiry}
                        onChange={e => setNewKeyExpiry(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="do-btn-gold" style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem', alignSelf: 'flex-end' }}>
                      Create key
                    </button>
                  </form>

                  {createdKey && (
                    <div style={{ padding: '0.75rem', borderRadius: '0.4rem', background: 'var(--do-gold-bg)', border: '1px solid var(--do-gold)', marginBottom: '1rem' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--do-gold-dark)', marginBottom: '0.35rem' }}>Key created — copy it now, it won't be shown again:</p>
                      <code className="st-input-mono" style={{ display: 'block', fontSize: '0.78rem', wordBreak: 'break-all', color: 'var(--do-text)' }}>{createdKey.key}</code>
                    </div>
                  )}

                  <div>
                    {apiKeys.map(k => (
                      <div key={k.id} className="st-apikey-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--do-text)' }}>{k.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--do-text-muted)', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                            {k.key_prefix}… · Created {new Date(k.created_at).toLocaleDateString()}
                            {k.expires_at && ` · Expires ${new Date(k.expires_at).toLocaleDateString()}`}
                          </div>
                        </div>
                        <button
                          className="do-btn-outline"
                          onClick={() => revokeApiKey(k.id)}
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', color: 'var(--danger)', borderColor: 'var(--danger-line)', flexShrink: 0 }}
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                    {apiKeys.length === 0 && (
                      <p style={{ fontSize: '0.82rem', color: 'var(--do-text-muted)', textAlign: 'center', padding: '1rem 0' }}>No API keys yet.</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Webhooks */}
              <section className="st-section" id="settings-webhooks">
                <h2 className="st-section-title">Webhooks</h2>

                {/* Create form */}
                <form onSubmit={createWebhook} className="do-card" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--do-text)' }}>New webhook</p>
                  <div>
                    <label className="st-field-label">URL</label>
                    <input
                      className="st-input st-input-mono"
                      value={newWh.url}
                      onChange={e => setNewWh(w => ({ ...w, url: e.target.value }))}
                      placeholder="https://your-server.com/webhook"
                    />
                  </div>
                  <div>
                    <label className="st-field-label">Description</label>
                    <input
                      className="st-input"
                      value={newWh.description}
                      onChange={e => setNewWh(w => ({ ...w, description: e.target.value }))}
                      placeholder="What this webhook is for"
                    />
                  </div>
                  <div>
                    <label className="st-field-label" style={{ marginBottom: '0.5rem' }}>Events</label>
                    <EventSelector value={newWh.events} onChange={evts => setNewWh(w => ({ ...w, events: evts }))} />
                  </div>
                  <div>
                    <button type="submit" className="do-btn-gold" style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem' }}>
                      Add webhook
                    </button>
                  </div>
                </form>

                {/* Webhook list */}
                {webhooks.map(wh => (
                  <div key={wh.id} className="st-wh-row">
                    {editingId === wh.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <div>
                          <label className="st-field-label">URL</label>
                          <input className="st-input st-input-mono" value={editForm.url || ''} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} />
                        </div>
                        <div>
                          <label className="st-field-label">Description</label>
                          <input className="st-input" value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div>
                          <label className="st-field-label" style={{ marginBottom: '0.4rem' }}>Events</label>
                          <EventSelector value={editForm.events || []} onChange={evts => setEditForm(f => ({ ...f, events: evts }))} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="do-btn-gold" onClick={() => saveWebhook(wh.id)} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>Save</button>
                          <button className="do-btn-outline" onClick={() => setEditingId(null)} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.8rem', color: 'var(--do-text)', wordBreak: 'break-all', marginBottom: '0.2rem' }}>{wh.url}</div>
                          {wh.description && <div style={{ fontSize: '0.75rem', color: 'var(--do-text-muted)', marginBottom: '0.2rem' }}>{wh.description}</div>}
                          <div style={{ fontSize: '0.72rem', color: 'var(--do-text-muted)' }}>
                            {(wh.events?.length === 0 || !wh.events) ? 'All events' : wh.events.join(', ')}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          <button className="do-btn-outline" onClick={() => { setEditingId(wh.id); setEditForm({ url: wh.url, description: wh.description, events: wh.events || [] }); }} style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}>Edit</button>
                          <button className="do-btn-outline" onClick={() => deleteWebhook(wh.id)} style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem', color: 'var(--danger)', borderColor: 'var(--danger-line)' }}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Simulate event */}
                {webhooks.length > 0 && (
                  <div className="do-card" style={{ padding: '1rem', marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--do-text)' }}>Simulate event</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label className="st-field-label">Webhook</label>
                        <select className="st-input" style={{ maxWidth: '16rem' }} value={testEventWh} onChange={e => setTestEventWh(e.target.value)}>
                          <option value="">Select webhook…</option>
                          {webhooks.map(w => <option key={w.id} value={w.id}>{w.url}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="st-field-label">Event type</label>
                        <select className="st-input" style={{ maxWidth: '14rem' }} value={testEventType} onChange={e => setTestEventType(e.target.value)}>
                          <option value="">Select event…</option>
                          {eventTypes.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </div>
                      <button className="do-btn-outline" onClick={testWebhookEvent} disabled={!testEventWh || !testEventType} style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', alignSelf: 'flex-end' }}>
                        Send test
                      </button>
                    </div>
                    {testEventResult && (
                      <div className="st-mcp-block" style={{ fontSize: '0.75rem' }}>
                        {JSON.stringify(testEventResult, null, 2)}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* MCP */}
              <section className="st-section" id="settings-mcp">
                <h2 className="st-section-title">MCP</h2>
                <div className="do-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {mcpEndpoint && (
                    <div>
                      <label className="st-field-label">MCP Endpoint</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <code className="st-mcp-block" style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>{mcpEndpoint}</code>
                        <button className="do-btn-outline" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', flexShrink: 0 }} onClick={() => navigator.clipboard.writeText(mcpEndpoint).catch(() => {})}>
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {mcpTools.length > 0 && (
                    <div>
                      <label className="st-field-label" style={{ marginBottom: '0.4rem' }}>Available tools</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {mcpTools.map(t => (
                          <span key={t} className="st-pill st-pill-gold">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {mcpCursorFragment && (
                    <div>
                      <label className="st-field-label" style={{ marginBottom: '0.4rem' }}>Cursor MCP config snippet</label>
                      <div style={{ position: 'relative' }}>
                        <pre className="st-mcp-block">{mcpCursorFragment}</pre>
                        <button
                          className="do-btn-outline"
                          style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                          onClick={() => navigator.clipboard.writeText(mcpCursorFragment).catch(() => {})}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* ── DEV ── */}
          {activeTab === 'dev' && (
            <section className="st-section" id="settings-test-mode">
              <h2 className="st-section-title">Test Mode</h2>
              <div className="do-card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--do-text)', marginBottom: '0.25rem' }}>Enable test mode</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)' }}>
                      In test mode, emails are not delivered to real recipients. Use this for development and integration testing.
                    </div>
                  </div>
                  <button
                    className={`toggle${testMode ? ' on' : ''}`}
                    onClick={async () => {
                      const next = !testMode;
                      setTestMode(next);
                      try { await api.post('/settings/test-mode', { enabled: next }); }
                      catch (err) { setTestMode(!next); notify({ type: 'error', message: err.message }); }
                    }}
                  >
                      </button>
                </div>
              </div>
            </section>
          )}

          {/* ── BILLING ── */}
          {activeTab === 'billing' && (
            <section className="st-section" id="settings-billing-plan">
              <BillingTab />
            </section>
          )}

        </div>
      </div>

      {/* Known IPs Dialog */}
      {knownIpsOpen && (
        <div className="st-dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setKnownIpsOpen(false); }}>
          <div className="st-dialog">
            <div style={{ padding: '1.25rem 1.25rem 0', borderBottom: '1px solid var(--do-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--do-text)', margin: 0 }}>Known IPs</h3>
              <button onClick={() => setKnownIpsOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--do-text-muted)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--do-text-muted)', margin: 0 }}>
                Your current IP: <code style={{ fontFamily: 'ui-monospace, Consolas, monospace', background: 'var(--do-cream)', padding: '0 0.3rem', borderRadius: '0.2rem' }}>{currentIp}</code>
              </p>

              {knownIps.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--do-text-muted)', borderBottom: '1px solid var(--do-border)' }}>IP Address</th>
                      <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--do-text-muted)', borderBottom: '1px solid var(--do-border)' }}>Added</th>
                      <th style={{ borderBottom: '1px solid var(--do-border)' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {knownIps.map(ip => (
                      <tr key={ip.ip || ip}>
                        <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'ui-monospace, Consolas, monospace', color: 'var(--do-text)', borderBottom: '1px solid var(--do-border)' }}>{ip.ip || ip}</td>
                        <td style={{ padding: '0.4rem 0.5rem', color: 'var(--do-text-muted)', borderBottom: '1px solid var(--do-border)' }}>{ip.created_at ? new Date(ip.created_at).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', borderBottom: '1px solid var(--do-border)' }}>
                          <button
                            className="do-btn-outline"
                            onClick={() => removeKnownIp(ip.ip || ip)}
                            style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', color: 'var(--danger)', borderColor: 'var(--danger-line)' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--do-text-muted)', textAlign: 'center' }}>No known IPs. All IPs are allowed.</p>
              )}

              <form onSubmit={addKnownIp} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label className="st-field-label">Add IP address</label>
                  <input
                    className="st-input st-input-mono"
                    style={{ maxWidth: '100%' }}
                    value={newIpAddress}
                    onChange={e => setNewIpAddress(e.target.value)}
                    placeholder="192.168.1.1"
                  />
                </div>
                <button type="submit" className="do-btn-gold" style={{ fontSize: '0.82rem', padding: '0.45rem 1.25rem', alignSelf: 'flex-end', flexShrink: 0 }}>
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}