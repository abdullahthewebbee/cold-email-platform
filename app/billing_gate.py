"""Billing access gate — enforces active subscription on protected endpoints.

Bypass rules (no subscription check):
  1. User email is in BYPASS_EMAILS
  2. The org's owner email is in BYPASS_EMAILS (covers all org members)
  3. Stripe is not configured (dev/self-hosted mode)
"""
from __future__ import annotations

import logging
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_user
from app.models import Subscription, User, Organization
from app.settings_manager import settings

log = logging.getLogger("quickly.billing_gate")

BYPASS_EMAILS: frozenset[str] = frozenset({
    "arslanawan.dev@gmail.com",
    "abdullahthewebbee@gmail.com",
    "rehanthewebbee@gmail.com",
    "hello@devlet.tech",
})


async def _org_owner_email(db: AsyncSession, org_id: int) -> str | None:
    """Return the email of the org owner, or None."""
    result = await db.execute(
        select(User.email).where(User.org_id == org_id, User.is_owner == True)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def require_active_subscription(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """FastAPI dependency — raises 402 if the org has no active subscription.

    Bypassed when:
      - Stripe is not configured (dev mode)
      - The user email is in BYPASS_EMAILS
      - The org owner email is in BYPASS_EMAILS
    """
    # Dev mode bypass
    if not settings.stripe_secret_key:
        return

    # Direct bypass
    if user.email in BYPASS_EMAILS:
        return

    # Org-owner bypass (covers all members of a bypassed org)
    if user.org_id:
        owner_email = await _org_owner_email(db, user.org_id)
        if owner_email and owner_email in BYPASS_EMAILS:
            return

    # Check subscription
    result = await db.execute(
        select(Subscription).where(Subscription.org_id == user.org_id)
    )
    sub = result.scalar_one_or_none()
    if sub and sub.status == "active":
        return

    log.warning(
        "billing_gate: org_id=%s user=%s blocked — status=%s",
        user.org_id, user.email, sub.status if sub else "none",
    )
    raise HTTPException(
        status_code=402,
        detail={
            "error": "subscription_required",
            "message": "An active subscription is required. Please upgrade your plan.",
        },
    )
