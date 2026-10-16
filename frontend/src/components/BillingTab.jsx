import { useState, useEffect } from 'react';
import { api } from '../api';
import Icon from './ui/AegisIcon';

const PLAN_LABELS = { starter: 'Starter', growth: 'Growth', scale: 'Scale', agency: 'Agency' };
const BYPASS_EMAILS = ['arslanawan.dev@gmail.com','abdullahthewebbee@gmail.com','rehanthewebbee@gmail.com','hello@devlet.tech'];

const STATUS_BADGE = {
  active:   { label: 'Active',   cls: 'bg-green-900/40 text-green-400 border border-green-700' },
  none:     { label: 'No plan',  cls: 'bg-gray-800 text-gray-400 border border-gray-600' },
  canceled: { label: 'Canceled', cls: 'bg-red-900/40 text-red-400 border border-red-700' },
  past_due: { label: 'Past due', cls: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700' },
  trialing: { label: 'Trial',    cls: 'bg-teal-900/40 text-teal-400 border border-teal-700' },
};

const PLAN_MODES = {
  starter: { mode: 'Manual',          desc: 'Full manual control over every email.',             icon: 'pen-line' },
  growth:  { mode: 'Semi-Manual AI',  desc: 'AI drafts replies; you approve before sending.',    icon: 'users' },
  scale:   { mode: 'Full AI',         desc: 'AI writes, approves, and sends automatically.',     icon: 'cpu' },
  agency:  { mode: 'Full AI + White Label', desc: 'Everything in Scale plus white-label branding.', icon: 'building' },
};

const CREDIT_PACKS = [
  { id: 'credits_100',  credits: 100,  price: 5,  label: 'Starter Pack',  badge: 'value',   per: '$0.05/credit' },
  { id: 'credits_500',  credits: 500,  price: 20, label: 'Popular Pack',  badge: 'popular', per: '$0.04/credit · save 20%' },
  { id: 'credits_1000', credits: 1000, price: 35, label: 'Power Pack',    badge: 'power',   per: '$0.035/credit · save 30%' },
];

export default function BillingTab() {
  const [sub, setSub]                   = useState(null);
  const [plans, setPlans]               = useState([]);
  const [period, setPeriod]             = useState('monthly');
  const [loading, setLoading]           = useState(true);
  const [portalLoading, setPortalLoading]     = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState('');
  const [creditLoading, setCreditLoading]     = useState('');
  const [user, setUser]                 = useState(null);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [creditBalance, setCreditBalance] = useState(null);
  const [showPlans, setShowPlans]       = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/billing/subscription'),
      api.get('/billing/plans'),
      api.get('/auth/me'),
      api.get('/credits/balance'),
    ]).then(([s, p, u, c]) => {
      setSub(s);
      setPlans(p.plans || []);
      setBillingConfigured(p.billing_configured);
      setUser(u);
      setCreditBalance(c);
    }).finally(() => setLoading(false));
  }, []);

  const isBypassed = user && BYPASS_EMAILS.includes(user.email);

  const startCheckout = async (planId) => {
    setCheckoutLoading(planId);
    try {
      const res = await api.post('/billing/create-checkout-session', { plan: planId, period });
      window.location.href = res.url;
    } catch (e) {
      alert(e.message || 'Checkout failed');
    } finally {
      setCheckoutLoading('');
    }
  };

  const buyCredits = async (packId) => {
    setCreditLoading(packId);
    try {
      const res = await api.post('/billing/buy-credits', { pack_id: packId });
      window.location.href = res.url;
    } catch (e) {
      alert(e.message || 'Could not start credit purchase');
    } finally {
      setCreditLoading('');
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await api.post('/billing/create-portal-session');
      window.location.href = res.url;
    } catch (e) {
      alert(e.message || 'Could not open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <div className="py-10 text-center text-gray-400 text-sm">Loading billing info...</div>;

  const badge = STATUS_BADGE[sub?.status] || STATUS_BADGE.none;
  const currentPlanLabel = sub?.plan ? PLAN_LABELS[sub.plan] : null;
  const currentMode = sub?.plan ? PLAN_MODES[sub.plan] : null;
  const isActive = sub?.status === 'active' || sub?.status === 'trialing';

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── Internal account banner ── */}
      {isBypassed && (
        <div className="rounded-xl px-5 py-4 text-sm" style={{ background: 'var(--gold-dim)', border: '1px solid var(--border-active)', color: 'var(--gold)' }}>
          <strong>Internal account</strong> — billing is permanently bypassed for this account. All features are available without a subscription.
        </div>
      )}

      {/* ── Current plan card ── */}
      <section id="settings-billing-plan">
        <h2 className="text-lg font-semibold mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">Plan &amp; Subscription</h2>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current plan</div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {currentPlanLabel || 'No active plan'}
              </div>
              {sub?.current_period_end && (
                <div className="text-xs text-gray-400 mt-1">
                  {sub.cancel_at_period_end ? 'Cancels' : 'Renews'} {new Date(sub.current_period_end).toLocaleDateString()}
                </div>
              )}
              {/* Campaign mode badge */}
              {currentMode && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--success-dim)', border: '1px solid var(--success-line)', color: 'var(--success)' }}>
                  <span><Icon name={currentMode.icon} size={16} /></span>
                  <span>Campaign Mode: {currentMode.mode}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
              {isActive && billingConfigured && (
                <button onClick={openPortal} disabled={portalLoading}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  {portalLoading ? 'Loading...' : 'Manage subscription'}
                </button>
              )}
              {isActive && billingConfigured && (
                <button onClick={() => setShowPlans(v => !v)}
                  className="text-sm px-4 py-2 rounded-lg border border-teal-500 text-teal-500 hover:bg-teal-500/10 transition-colors">
                  {showPlans ? 'Hide plans' : 'Change plan'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Plan picker ── */}
      {!isBypassed && billingConfigured && (!isActive || showPlans) && (
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              {isActive ? 'Change plan' : 'Choose a plan'}
            </h3>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
              {['monthly', 'annual'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 font-medium transition-colors ${period === p ? 'bg-teal-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                  {p === 'annual' ? 'Annual (10% off)' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plans.map(plan => {
              const mode = PLAN_MODES[plan.id];
              const isCurrent = sub?.plan === plan.id && isActive;
              return (
                <div key={plan.id} className={`rounded-xl border p-5 flex flex-col gap-3 transition-all ${plan.id === 'growth' ? 'border-teal-400 dark:border-teal-500 ring-1 ring-teal-400' : 'border-gray-200 dark:border-gray-700'} ${isCurrent ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{plan.label}</div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        ${period === 'annual' ? plan.price_annual : plan.price_monthly}
                        <span className="text-sm font-normal text-gray-400">/mo</span>
                      </div>
                    </div>
                    {plan.id === 'growth' && (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-teal-100 text-teal-700">Popular</span>
                    )}
                  </div>

                  {/* Campaign mode pill */}
                  {mode && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg w-fit"
                      style={{ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid var(--success-line)' }}>
                      <Icon name={mode.icon} size={16} /> {mode.mode}
                    </div>
                  )}

                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <li><Icon name="check" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{plan.limits.inboxes ? `${plan.limits.inboxes} inboxes` : 'Unlimited inboxes'}</li>
                    <li><Icon name="check" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{plan.limits.emails_per_month ? `${plan.limits.emails_per_month.toLocaleString()} emails/mo` : 'Unlimited emails'}</li>
                    <li><Icon name="check" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{plan.limits.active_leads ? `${plan.limits.active_leads.toLocaleString()} active leads` : 'Unlimited leads'}</li>
                    {plan.limits.api_access && <li><Icon name="check" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />API access &amp; webhooks</li>}
                    {plan.limits.white_label && <li><Icon name="check" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />White-label branding</li>}
                  </ul>

                  <button
                    onClick={() => startCheckout(plan.id)}
                    disabled={!!checkoutLoading || isCurrent}
                    className={`mt-auto w-full py-2 rounded-lg text-sm font-semibold transition-colors ${isCurrent ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : plan.id === 'growth' ? 'bg-teal-500 hover:bg-teal-600 text-white' : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'}`}>
                    {isCurrent ? 'Current plan' : checkoutLoading === plan.id ? 'Redirecting...' : `Get ${plan.label}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Campaign mode comparison */}
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Campaign Mode by Plan
            </div>
            {Object.entries(PLAN_MODES).map(([planId, info]) => (
              <div key={planId} className={`flex items-center gap-4 px-5 py-3 border-t border-gray-100 dark:border-gray-700/50 ${sub?.plan === planId && isActive ? 'bg-teal-500/5' : ''}`}>
                <span className="text-base"><Icon name={info.icon} size={16} /></span>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{PLAN_LABELS[planId]}</span>
                  <span className="ml-2 text-xs text-gray-400">{info.desc}</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid var(--success-line)' }}>
                  {info.mode}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── AI Credits ── */}
      {!isBypassed && billingConfigured && (
        <section>
          <h2 className="text-lg font-semibold mb-1 border-b border-gray-200 dark:border-gray-700 pb-2">AI Credits</h2>
          <p className="text-sm text-gray-400 mb-4">
            Power reply drafts, personalization &amp; sequence generation with DeepSeek V3 Flash. <strong className="text-gray-200">1 credit = 1 operation.</strong> Credits never expire.
          </p>

          {/* Balance */}
          <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-xl border border-gray-700 w-fit"
            style={{ background: 'var(--success-dim)' }}>
            <span className="text-xl"><Icon name="zap" size={20} /></span>
            <div>
              <div className="text-xs text-gray-400">Current balance</div>
              <div className="text-lg font-bold text-teal-400">
                {creditBalance?.is_bypass ? 'Unlimited' : `${creditBalance?.balance ?? 0} credits`}
              </div>
            </div>
          </div>

          {/* Credit pack cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CREDIT_PACKS.map(pack => (
              <div key={pack.id} className={`rounded-xl border p-5 flex flex-col gap-3 text-center transition-all hover:-translate-y-1 ${pack.badge === 'popular' ? 'border-teal-400 ring-1 ring-teal-400' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit mx-auto ${pack.badge === 'popular' ? 'bg-teal-500 text-black' : pack.badge === 'power' ? 'bg-purple-900/50 text-purple-300 border border-purple-700' : 'bg-gray-800 text-gray-300 border border-gray-600'}`}>
                  {pack.label}
                </div>
                <div>
                  <div className="text-4xl font-black text-white">{pack.credits.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">AI Credits</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-teal-400">${pack.price}</div>
                  <div className="text-xs text-gray-500">{pack.per}</div>
                </div>
                <button
                  onClick={() => buyCredits(pack.id)}
                  disabled={!!creditLoading}
                  className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${pack.badge === 'popular' ? 'bg-teal-500 hover:bg-teal-600 text-white' : 'border border-gray-600 hover:bg-gray-800 text-gray-200'}`}>
                  {creditLoading === pack.id ? 'Redirecting...' : 'Buy now'}
                </button>
              </div>
            ))}
          </div>

          {/* DeepSeek model note */}
          <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(20,217,172,0.04)', border: '1px solid rgba(20,217,172,0.14)' }}>
            <span className="text-xl"><Icon name="cpu" size={20} /></span>
            <div>
              <div className="font-semibold text-gray-200 mb-0.5">DeepSeek V3 Flash</div>
              <div className="text-gray-400 text-xs">Fast, affordable AI optimized for cold email copy. Every AI operation (reply draft, personalization, sequence step, first-touch email) costs exactly 1 credit.</div>
            </div>
          </div>
        </section>
      )}

      {/* AI credits for bypass accounts */}
      {isBypassed && (
        <section>
          <h2 className="text-lg font-semibold mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">AI Credits</h2>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-teal-700 w-fit"
            style={{ background: 'rgba(20,217,172,0.05)' }}>
            <span className="text-xl"><Icon name="zap" size={20} /></span>
            <div>
              <div className="text-xs text-gray-400">Balance</div>
              <div className="text-lg font-bold text-teal-400">Unlimited</div>
            </div>
          </div>
        </section>
      )}

      {/* Not configured notice */}
      {!billingConfigured && !isBypassed && (
        <div className="rounded-xl px-5 py-4 text-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300">
          Stripe is not configured on this server. Add <code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900 px-1 rounded">STRIPE_SECRET_KEY</code> to your environment to enable billing.
        </div>
      )}
    </div>
  );
}