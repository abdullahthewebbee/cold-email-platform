"""Stripe billing — checkout, customer portal, subscription status, and webhooks.

Scope (deliberately, per plan): this tracks subscription state (plan, status,
period) so the app knows what an org is subscribed to. It does NOT enforce
usage limits (inbox/lead/email/AI caps) — that access-gate is a separate,
later piece. See app.models.Subscription docstring.
"""
from __future__ import annotations

import logging
from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_org_id, get_current_user
from app.rate_limit import limiter
from app.models import Subscription, Organization, User
from app.settings_manager import settings
from app.billing_plans import PLAN_IDS, PERIODS, get_price_id, get_all_plans_for_frontend, CREDIT_PACKS, get_credit_pack, get_credit_pack_price_id

log = logging.getLogger("quickly.billing")
router = APIRouter(prefix="/api/billing", tags=["billing"])


def _stripe_configured() -> bool:
    return bool(settings.stripe_secret_key)


def _require_stripe():
    if not _stripe_configured():
        raise HTTPException(503, "Billing is not configured on this server (missing STRIPE_SECRET_KEY).")
    stripe.api_key = settings.stripe_secret_key


async def _get_or_create_subscription_row(db: AsyncSession, org_id: int) -> Subscription:
    result = await db.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub = result.scalar_one_or_none()
    if sub:
        return sub
    sub = Subscription(org_id=org_id, status="none")
    db.add(sub)
    await db.flush()
    return sub


@router.get("/plans")
async def list_plans():
    """Public plan metadata for the pricing/billing page — no auth required."""
    return {"plans": get_all_plans_for_frontend(), "billing_configured": _stripe_configured()}


@router.get("/subscription")
async def get_subscription(
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    """Return the current org's subscription state."""
    result = await db.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub = result.scalar_one_or_none()
    if not sub:
        return {"plan": None, "status": "none", "billing_period": None,
                "current_period_end": None, "cancel_at_period_end": False}
    return {
        "plan": sub.plan,
        "status": sub.status,
        "billing_period": sub.billing_period,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
    }


class CheckoutRequest(BaseModel):
    plan: str
    period: str = "monthly"


@router.post("/create-checkout-session")
@limiter.limit("10/minute")  # prevent Stripe API abuse
async def create_checkout_session(
    request: Request,
    data: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
    user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout Session for the given plan/period and return its URL."""
    _require_stripe()
    if data.plan not in PLAN_IDS:
        raise HTTPException(400, f"Unknown plan: {data.plan}")
    if data.period not in PERIODS:
        raise HTTPException(400, f"Unknown billing period: {data.period}")
    price_id = get_price_id(data.plan, data.period)
    if not price_id:
        raise HTTPException(503, f"No Stripe price configured for {data.plan}/{data.period}")

    sub = await _get_or_create_subscription_row(db, org_id)

    # Reuse the existing Stripe customer if we have one; otherwise create one.
    if not sub.stripe_customer_id:
        org = await db.get(Organization, org_id)
        customer = stripe.Customer.create(
            email=user.email,
            name=org.name if org else None,
            metadata={"org_id": str(org_id)},
        )
        sub.stripe_customer_id = customer.id
        await db.flush()
        await db.commit()

    base_url = settings.base_url.rstrip("/")
    session = stripe.checkout.Session.create(
        customer=sub.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{base_url}/settings?billing=success",
        cancel_url=f"{base_url}/settings?billing=cancelled",
        client_reference_id=str(org_id),
        metadata={"org_id": str(org_id), "plan": data.plan, "period": data.period},
    )
    return {"url": session.url}


@router.post("/create-portal-session")
async def create_portal_session(
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    """Create a Stripe Customer Portal session so the org can manage/cancel their own subscription."""
    _require_stripe()
    result = await db.execute(select(Subscription).where(Subscription.org_id == org_id))
    sub = result.scalar_one_or_none()
    if not sub or not sub.stripe_customer_id:
        raise HTTPException(404, "No billing account found for this organization yet.")

    base_url = settings.base_url.rstrip("/")
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{base_url}/settings",
    )
    return {"url": session.url}


# ── Webhook ──────────────────────────────────────────────────────────────

def _plan_and_period_from_stripe_subscription(stripe_sub: dict) -> tuple[str | None, str | None]:
    """Best-effort: infer our internal plan/period from the Stripe subscription's price ID
    by reverse-matching against the configured price IDs."""
    try:
        price_id = stripe_sub["items"]["data"][0]["price"]["id"]
    except (KeyError, IndexError):
        return None, None
    for plan in PLAN_IDS:
        for period in PERIODS:
            if get_price_id(plan, period) == price_id:
                return plan, period
    return None, None


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Stripe webhook endpoint. Verifies signature, then syncs our Subscription
    row to match Stripe's view of the world (Stripe is the source of truth)."""
    _require_stripe()
    if not settings.stripe_webhook_secret:
        raise HTTPException(503, "Webhook secret not configured (STRIPE_WEBHOOK_SECRET).")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        log.warning("stripe_webhook: signature verification failed: %s", exc)
        raise HTTPException(400, "Invalid webhook signature")

    event_type = event["type"]
    obj = event["data"]["object"]
    log.info("stripe_webhook: received %s", event_type)

    if event_type == "checkout.session.completed" and (obj.get("metadata") or {}).get("purchase_type") == "dfy_order":
        # Done-for-you setup: a one-time payment, NOT a subscription - do not touch the Subscription row.
        meta = obj.get("metadata") or {}
        try:
            from app.routers.done_for_you import mark_order_paid
            await mark_order_paid(
                db,
                int(meta.get("order_id", 0)),
                int(meta.get("org_id", 0)) or None,
                obj.get("amount_total"),
                (obj.get("customer_details") or {}).get("email") or obj.get("customer_email"),
            )
        except Exception:
            log.exception("stripe_webhook: failed to mark done-for-you order paid")

    elif event_type == "checkout.session.completed":
        org_id = int(obj.get("client_reference_id") or obj.get("metadata", {}).get("org_id", 0))
        if org_id:
            sub = await _get_or_create_subscription_row(db, org_id)
            sub.stripe_customer_id = obj.get("customer") or sub.stripe_customer_id
            sub.stripe_subscription_id = obj.get("subscription")
            sub.plan = obj.get("metadata", {}).get("plan") or sub.plan
            sub.billing_period = obj.get("metadata", {}).get("period") or sub.billing_period
            sub.status = "active"
            await db.commit()
            log.info("stripe_webhook: checkout completed for org_id=%s plan=%s", org_id, sub.plan)

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        stripe_sub_id = obj.get("id")
        result = await db.execute(select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id))
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = obj.get("status", sub.status)
            sub.cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
            period_end = obj.get("current_period_end")
            if period_end:
                sub.current_period_end = datetime.utcfromtimestamp(period_end)
            plan, period = _plan_and_period_from_stripe_subscription(obj)
            if plan:
                sub.plan = plan
                sub.billing_period = period
            await db.commit()
            log.info("stripe_webhook: subscription updated stripe_sub_id=%s status=%s", stripe_sub_id, sub.status)

    elif event_type == "customer.subscription.deleted":
        stripe_sub_id = obj.get("id")
        result = await db.execute(select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id))
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "canceled"
            await db.commit()
            log.info("stripe_webhook: subscription canceled stripe_sub_id=%s", stripe_sub_id)

    elif event_type == "invoice.payment_failed":
        customer_id = obj.get("customer")
        result = await db.execute(select(Subscription).where(Subscription.stripe_customer_id == customer_id))
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "past_due"
            await db.commit()
            log.warning("stripe_webhook: payment failed for customer_id=%s", customer_id)

    elif event_type == "checkout.session.completed":
        # Credit pack one-time purchase
        meta = obj.get("metadata", {})
        if meta.get("purchase_type") == "ai_credits":
            org_id_str = meta.get("org_id")
            pack_id = meta.get("pack_id")
            if org_id_str and pack_id:
                from app.credits import add_credits
                from app.billing_plans import get_credit_pack
                pack = get_credit_pack(pack_id)
                if pack:
                    new_bal = await add_credits(db, int(org_id_str), pack["credits"])
                    await db.commit()
                    log.info(
                        "stripe_webhook: ai_credits purchased org_id=%s pack=%s credits=%d new_balance=%d",
                        org_id_str, pack_id, pack["credits"], new_bal,
                    )

    return {"received": True}


# ---------------------------------------------------------------------------
# POST /api/billing/buy-credits
# ---------------------------------------------------------------------------
class BuyCreditsRequest(BaseModel):
    pack_id: str  # credits_100 | credits_500 | credits_1000


@router.post("/buy-credits")
@limiter.limit("10/minute")
async def buy_credits(
    request: Request,
    data: BuyCreditsRequest,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
    user: User = Depends(get_current_user),
):
    """Create a Stripe one-time Checkout Session to purchase AI credits."""
    _require_stripe()
    pack = get_credit_pack(data.pack_id)
    if not pack:
        raise HTTPException(400, f"Unknown credit pack: {data.pack_id}")

    price_id = get_credit_pack_price_id(data.pack_id)
    if not price_id:
        raise HTTPException(503, f"Stripe price not configured for {data.pack_id}. Add STRIPE_PRICE_{data.pack_id.upper()} to settings.")

    sub = await _get_or_create_subscription_row(db, org_id)
    if not sub.stripe_customer_id:
        org = await db.get(Organization, org_id)
        customer = stripe.Customer.create(
            email=user.email,
            name=org.name if org else None,
            metadata={"org_id": str(org_id)},
        )
        sub.stripe_customer_id = customer.id
        await db.flush()
        await db.commit()

    base_url = settings.base_url.rstrip("/")
    session = stripe.checkout.Session.create(
        customer=sub.stripe_customer_id,
        mode="payment",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{base_url}/settings?credits=success",
        cancel_url=f"{base_url}/settings?credits=cancelled",
        client_reference_id=str(org_id),
        metadata={
            "org_id": str(org_id),
            "pack_id": data.pack_id,
            "purchase_type": "ai_credits",
        },
    )
    return {"url": session.url}


@router.get("/credit-packs")
async def list_credit_packs():
    """Return available AI credit packs for the frontend."""
    return {"packs": CREDIT_PACKS}