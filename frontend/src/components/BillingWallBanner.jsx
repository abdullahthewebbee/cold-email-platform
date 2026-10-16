import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

const BYPASS_EMAILS = [
  'arslanawan.dev@gmail.com',
  'abdullahthewebbee@gmail.com',
  'rehanthewebbee@gmail.com',
  'hello@devlet.tech',
];

const ACTIVE_STATUSES = ['active', 'trialing'];
const DISMISS_KEY = 'billing_banner_dismissed_until';

export default function BillingWallBanner() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    try {
      const until = localStorage.getItem(DISMISS_KEY);
      if (until && Date.now() < parseInt(until)) return;
    } catch {}

    Promise.all([
      api.get('/billing/subscription'),
      api.get('/auth/me'),
    ]).then(([sub, user]) => {
      if (BYPASS_EMAILS.includes(user.email)) return;
      if (!ACTIVE_STATUSES.includes(sub.status)) {
        setStatus(sub.status || 'none');
        setShow(true);
      }
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  const isPastDue  = status === 'past_due';
  const isCanceled = status === 'canceled';
  const isError    = isPastDue || isCanceled;

  const message = isPastDue
    ? 'Your payment failed. Update billing details to restore full access.'
    : isCanceled
    ? 'Your subscription was canceled. Reactivate to continue using InboxAir.'
    : 'You\'re on the free plan — campaigns, inboxes, and AI are locked.';

  const ctaLabel = isPastDue ? 'Fix billing' : isCanceled ? 'Reactivate' : 'Upgrade now';

  return (
    <>
      <style>{`
        .bwb-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 9px 20px;
          border-bottom: 1px solid;
          font-size: 12.5px;
          font-weight: 500;
          position: relative;
          z-index: 10;
          background: ${isError ? 'var(--danger-dim)' : 'var(--accent-dim)'};
          border-color: ${isError ? 'var(--danger-line)' : 'var(--border-active)'};
          color: var(--text);
        }
        .bwb-left {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .bwb-icon {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: ${isError ? 'var(--danger-dim)' : 'var(--accent-dim)'};
        }
        .bwb-text {
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bwb-text strong {
          color: var(--text);
          font-weight: 700;
        }
        .bwb-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .bwb-cta {
          padding: 5px 14px;
          border-radius: 9999px;
          font-size: 11.5px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          letter-spacing: .3px;
          transition: opacity .15s, transform .1s;
          background: ${isError ? 'var(--danger)' : 'var(--accent)'};
          color: var(--white);
        }
        .bwb-cta:hover { opacity: .88; transform: translateY(-1px); }
        .bwb-cta:active { transform: scale(.97); }
        .bwb-dismiss {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-dim);
          font-size: 16px;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 4px;
          transition: color .15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bwb-dismiss:hover { color: var(--text); }
      `}</style>

      <div className="bwb-wrap">
        <div className="bwb-left">
          <div className="bwb-icon">
            {isError ? (
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={isError ? 'var(--danger)' : 'var(--accent)'} strokeWidth="2">
                <path d="M10 3L18 17H2L10 3z"/><path d="M10 9v4M10 15v.5"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="2">
                <rect x="3" y="9" width="14" height="10" rx="2"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>
              </svg>
            )}
          </div>
          <span className="bwb-text">
            <strong>{isError ? (isPastDue ? 'Payment failed.' : 'Subscription canceled.') : 'Free plan.'}</strong>
            {' '}{message.replace(/^[^.]+\./, '').trim()}
          </span>
        </div>
        <div className="bwb-right">
          <button className="bwb-cta" onClick={() => navigate('/settings?tab=billing')}>
            {ctaLabel}
          </button>
          <button className="bwb-dismiss" onClick={dismiss} title="Dismiss for 24 hours" aria-label="Dismiss">
            ×
          </button>
        </div>
      </div>
    </>
  );
}