import { useState, useEffect } from 'react';
import { api } from '../api';

const BYPASS_EMAILS = [
  'arslanawan.dev@gmail.com',
  'abdullahthewebbee@gmail.com',
  'rehanthewebbee@gmail.com',
  'hello@devlet.tech',
];

const ACTIVE_STATUSES = ['active', 'trialing'];

let _cache = null;

export function useSubscription() {
  const [isActive, setIsActive] = useState(true); // optimistic default
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (_cache !== null) {
      setIsActive(_cache);
      setLoading(false);
      return;
    }
    Promise.all([
      api.get('/billing/subscription'),
      api.get('/auth/me'),
    ]).then(([sub, user]) => {
      if (BYPASS_EMAILS.includes(user.email)) {
        _cache = true;
        setIsActive(true);
        return;
      }
      const active = ACTIVE_STATUSES.includes(sub.status);
      _cache = active;
      setIsActive(active);
    }).catch(() => {
      setIsActive(true); // fail open
    }).finally(() => setLoading(false));
  }, []);

  return { isActive, loading };
}