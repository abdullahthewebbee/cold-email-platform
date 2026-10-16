"""Done-for-you setup (paid, one-time): customers request a managed setup (domains, inboxes,
DNS, warm-up); the platform team fulfils it and updates status/message.

Customer endpoints (org-scoped):
    GET  /api/done-for-you/pricing
    GET  /api/done-for-you/orders
    POST /api/done-for-you/orders                 -> creates the order as "pending_payment"
    POST /api/done-for-you/orders/{id}/checkout   -> {url} Stripe Checkout (one-time payment)
    POST /api/done-for-you/orders/{id}/cancel     (only while unpaid)

The Stripe webhook (app/routers/billing.py) calls ``mark_order_paid`` which moves the order to
"submitted" and alerts the team. Prices (USD, override with env): DFY_PRICE_PER_DOMAIN (15),
DFY_PRICE_PER_INBOX (10), DFY_PRICE_PER_EXTRA (25), DFY_PRICE_BASE (0).

Platform-team endpoints (users whose e-mail is listed in PLATFORM_ADMIN_EMAILS):
    GET   /api/done-for-you/admin/orders
    PATCH /api/done-for-you/admin/orders/{id}   {status?, message?}

Alerts go to DFY_NOTIFY_EMAIL, else the first PLATFORM_ADMIN_EMAILS entry, else the already-configured
system address (SYSTEM_FROM_EMAIL / SYSTEM_SMTP_USERNAME). Sending needs the existing SYSTEM_SMTP_* settings.
"""
from __future__ import annotations

import asyncio
import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_org_id, get_current_user
from app.database import get_db
from app.models import DoneForYouOrder
from app.time import utcnow
from app.settings_manager import settings

log = logging.getLogger("quickly.done_for_you")

router = APIRouter(prefix="/api/done-for-you", tags=["done-for-you"])

STATUSES = {"pending_payment", "submitted", "in_review", "awaiting_customer", "in_progress", "completed", "cancelled"}
CANCELLABLE = {"pending_payment"}
PROVIDERS = {"google", "microsoft", "mixed"}


class OrderCreate(BaseModel):
    business_name: str = Field(min_length=1, max_length=255)
    website: str = Field(default="", max_length=255)
    provider: str = "google"
    domains_count: int = Field(default=1, ge=1, le=50)
    inboxes_per_domain: int = Field(default=1, ge=1, le=10)
    daily_volume: int = Field(default=0, ge=0, le=100000)
    preferred_domains: list[str] = Field(default_factory=list, max_length=50)
    extra_setup: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field(default="", max_length=4000)


class AdminUpdate(BaseModel):
    status: str | None = None
    message: str | None = Field(default=None, max_length=4000)


def _price(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, default)))
    except ValueError:
        return float(default)


def pricing() -> dict:
    return {
        "currency": "usd",
        "base": _price("DFY_PRICE_BASE", 0),
        "per_domain": _price("DFY_PRICE_PER_DOMAIN", 15),
        "per_inbox": _price("DFY_PRICE_PER_INBOX", 10),
        "per_extra": _price("DFY_PRICE_PER_EXTRA", 25),
    }


def compute_amount_cents(domains: int, inboxes_per_domain: int, extras: int) -> int:
    p = pricing()
    total = p["base"] + domains * p["per_domain"] + domains * inboxes_per_domain * p["per_inbox"] + extras * p["per_extra"]
    return int(round(total * 100))


def _to_dict(o: DoneForYouOrder) -> dict:
    return {
        "id": o.id,
        "org_id": o.org_id,
        "business_name": o.business_name,
        "website": o.website,
        "provider": o.provider,
        "domains_count": o.domains_count,
        "inboxes_per_domain": o.inboxes_per_domain,
        "daily_volume": o.daily_volume,
        "preferred_domains": o.preferred_domains or [],
        "extra_setup": o.extra_setup or [],
        "notes": o.notes,
        "status": o.status,
        "message": o.message,
        "amount_cents": o.amount_cents or 0,
        "payment_status": o.payment_status or "unpaid",
        "paid_at": o.paid_at.isoformat() if o.paid_at else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }


def _platform_admin_emails() -> set[str]:
    return {e.strip().lower() for e in os.getenv("PLATFORM_ADMIN_EMAILS", "").split(",") if e.strip()}


def _notify_address() -> str:
    """Where new-request alerts go: DFY_NOTIFY_EMAIL, else the first PLATFORM_ADMIN_EMAILS
    entry, else the already-configured system mail address (SYSTEM_FROM_EMAIL / SYSTEM_SMTP_USERNAME)."""
    explicit = os.getenv("DFY_NOTIFY_EMAIL", "").strip()
    if explicit:
        return explicit
    admins = [e for e in os.getenv("PLATFORM_ADMIN_EMAILS", "").split(",") if e.strip()]
    if admins:
        return admins[0].strip()
    return (os.getenv("SYSTEM_FROM_EMAIL", "") or os.getenv("SYSTEM_SMTP_USERNAME", "")).strip()


async def require_platform_admin(user=Depends(get_current_user)):
    if (user.email or "").strip().lower() not in _platform_admin_emails():
        raise HTTPException(403, "Platform admin access required")
    return user


@router.get("/orders")
async def list_orders(
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    rows = (await db.execute(
        select(DoneForYouOrder).where(DoneForYouOrder.org_id == org_id).order_by(DoneForYouOrder.created_at.desc())
    )).scalars().all()
    return [_to_dict(r) for r in rows]


@router.post("/orders", status_code=201)
async def create_order(
    data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
    user=Depends(get_current_user),
):
    if data.provider not in PROVIDERS:
        raise HTTPException(422, "Invalid provider")
    order = DoneForYouOrder(
        org_id=org_id,
        created_by=user.id,
        business_name=data.business_name.strip(),
        website=data.website.strip(),
        provider=data.provider,
        domains_count=data.domains_count,
        inboxes_per_domain=data.inboxes_per_domain,
        daily_volume=data.daily_volume,
        preferred_domains=[d.strip() for d in data.preferred_domains if d.strip()],
        extra_setup=[x.strip()[:40] for x in data.extra_setup if x.strip()],
        notes=data.notes.strip(),
        status="pending_payment",
        payment_status="unpaid",
        amount_cents=compute_amount_cents(data.domains_count, data.inboxes_per_domain, len([x for x in data.extra_setup if x.strip()])),
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    return _to_dict(order)


@router.get("/pricing")
async def get_pricing():
    return pricing()


@router.post("/orders/{order_id}/checkout")
async def order_checkout(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
    user=Depends(get_current_user),
):
    """Create a Stripe one-time Checkout Session for an unpaid order."""
    order = (await db.execute(
        select(DoneForYouOrder).where(DoneForYouOrder.id == order_id, DoneForYouOrder.org_id == org_id)
    )).scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Request not found")
    if order.payment_status == "paid":
        raise HTTPException(400, "This request is already paid")
    if order.status == "cancelled":
        raise HTTPException(400, "This request was cancelled")
    if order.amount_cents <= 0:
        raise HTTPException(400, "This request has no amount to pay")
    if not settings.stripe_secret_key:
        raise HTTPException(503, "Payments are not configured on this server (missing STRIPE_SECRET_KEY).")

    import stripe
    stripe.api_key = settings.stripe_secret_key
    base_url = settings.base_url.rstrip("/")
    session = stripe.checkout.Session.create(
        mode="payment",
        customer_email=user.email,
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": order.amount_cents,
                "product_data": {
                    "name": "Done-for-you setup",
                    "description": f"{order.domains_count} domain(s), {order.inboxes_per_domain} inbox(es) each - {order.business_name}",
                },
            },
            "quantity": 1,
        }],
        success_url=f"{base_url}/done-for-you?paid=1&order={order.id}",
        cancel_url=f"{base_url}/done-for-you?paid=0&order={order.id}",
        client_reference_id=str(org_id),
        metadata={"purchase_type": "dfy_order", "order_id": str(order.id), "org_id": str(org_id)},
    )
    order.stripe_session_id = session.id
    await db.commit()
    return {"url": session.url}


async def mark_order_paid(db: AsyncSession, order_id: int, org_id: int | None, amount_total: int | None, customer_email: str | None = None) -> bool:
    """Called from the Stripe webhook. Idempotent. Returns True if the order was newly marked paid."""
    order = (await db.execute(select(DoneForYouOrder).where(DoneForYouOrder.id == order_id))).scalar_one_or_none()
    if not order or (org_id is not None and order.org_id != org_id):
        log.warning("DFY webhook: order %s not found for org %s", order_id, org_id)
        return False
    if order.payment_status == "paid":
        return False
    if amount_total is not None and int(amount_total) != int(order.amount_cents):
        log.error("DFY webhook: amount mismatch for order %s (paid %s, expected %s)", order_id, amount_total, order.amount_cents)
        return False
    order.payment_status = "paid"
    order.paid_at = utcnow()
    order.updated_at = utcnow()
    if order.status == "pending_payment":
        order.status = "submitted"
    await db.commit()
    await _notify_team(order, customer_email)
    return True


async def _notify_team(order: DoneForYouOrder, customer_email: str | None) -> None:
    notify_to = _notify_address()
    if not notify_to:
        return
    try:
        from app.system_mail import send_system_email
        body = (
            f"New PAID done-for-you request #{order.id}  (${order.amount_cents / 100:.2f})\n\n"
            f"Business: {order.business_name}\nWebsite: {order.website}\n"
            f"Provider: {order.provider}\nDomains: {order.domains_count} x {order.inboxes_per_domain} inboxes\n"
            f"Daily volume: {order.daily_volume}\nPreferred: {', '.join(order.preferred_domains or []) or '-'}\n"
            f"Also set up: {', '.join(order.extra_setup or []) or '-'}\n"
            f"Customer: {customer_email or '-'} (org {order.org_id})\n\nNotes:\n{order.notes or '-'}\n"
        )
        await asyncio.to_thread(send_system_email, notify_to, f"Paid done-for-you request #{order.id}", body)
    except Exception:  # never fail the webhook because of mail
        log.exception("DFY notification failed")


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    order = (await db.execute(
        select(DoneForYouOrder).where(DoneForYouOrder.id == order_id, DoneForYouOrder.org_id == org_id)
    )).scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Request not found")
    if order.status not in CANCELLABLE:
        raise HTTPException(400, "A paid request cannot be cancelled here. Contact support for a refund.")
    order.status = "cancelled"
    order.updated_at = utcnow()
    await db.commit()
    return _to_dict(order)


@router.get("/admin/orders")
async def admin_list_orders(
    status: str = "",
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_platform_admin),
):
    stmt = select(DoneForYouOrder).order_by(DoneForYouOrder.created_at.desc())
    if status:
        stmt = stmt.where(DoneForYouOrder.status == status)
    return [_to_dict(r) for r in (await db.execute(stmt)).scalars().all()]


@router.patch("/admin/orders/{order_id}")
async def admin_update_order(
    order_id: int,
    data: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_platform_admin),
):
    order = (await db.execute(select(DoneForYouOrder).where(DoneForYouOrder.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Request not found")
    if data.status is not None:
        if data.status not in STATUSES:
            raise HTTPException(422, "Invalid status")
        order.status = data.status
    if data.message is not None:
        order.message = data.message.strip()
    order.updated_at = utcnow()
    await db.commit()
    return _to_dict(order)
