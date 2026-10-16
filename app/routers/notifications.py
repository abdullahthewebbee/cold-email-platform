"""Notification API routes."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import EmailNotificationConfig, Notification, WEBHOOK_EVENT_TYPES
from app.notifications import get_unread_notification_count
from app.notifications import get_unread_notification_count, notification_events
import asyncio
import json
from fastapi import Request
from fastapi.responses import StreamingResponse
log = logging.getLogger("quickly.notifications.routes")

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class NotificationItem(BaseModel):
    id: int
    event_type: str
    title: str
    message: str
    lead_id: Optional[int] = None
    campaign_id: Optional[int] = None
    inbox_id: Optional[int] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    total: int
    unread: int


class NotificationConfigRequest(BaseModel):
    enabled: bool = False
    notification_email: str = ""
    events: list[str] = []
    rate_limit_per_hour: int = Field(default=10, ge=1, le=100)


class NotificationConfigResponse(BaseModel):
    enabled: bool
    notification_email: str
    events: list[str]
    rate_limit_per_hour: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Notification center (in-app)
# ---------------------------------------------------------------------------

@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = Query(False, description="Only return unread notifications"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user."""
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    items = result.scalars().all()

    # total count (always global, regardless of unread_only filter)
    total_result = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == user.id)
    )
    total = total_result.scalar() or 0

    unread = await get_unread_notification_count(db, user.id)

    return NotificationListResponse(
        items=[NotificationItem.from_orm(n) for n in items],
        total=total,
        unread=unread,
    )


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(404, "Notification not found")
    from app.time import utcnow
    notif.read_at = utcnow()
    await db.flush()
    from app.cache import cache_invalidate
    await cache_invalidate(f"unread:{user.id}")
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read for the current user."""
    from app.time import utcnow
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )
    for notif in result.scalars().all():
        notif.read_at = utcnow()
    await db.flush()
    from app.cache import cache_invalidate
    await cache_invalidate(f"unread:{user.id}")
    return {"ok": True}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notification."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(404, "Notification not found")
    await db.delete(notif)
    await db.flush()
    return {"ok": True}


@router.get("/unread-count")
async def unread_count(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the number of unread notifications for the current user.

    Cached for 10s in Redis — the frontend polls this every ~15s per open tab,
    so without caching every tab generates a COUNT query continuously. A 10s
    TTL keeps the badge feeling live while absorbing nearly all polling load.
    Cache is per-user, so no cross-tenant leakage is possible.
    """
    from app.cache import cache_get_json, cache_set_json

    cache_key = f"unread:{user.id}"
    cached = await cache_get_json(cache_key)
    if cached is not None:
        return cached

    count = await get_unread_notification_count(db, user.id)
    result = {"unread": count}
    await cache_set_json(cache_key, result, ttl=10)
    return result


# ---------------------------------------------------------------------------
# Preferences (email channel config)
# ---------------------------------------------------------------------------

@router.get("/config", response_model=NotificationConfigResponse)
async def get_notification_config(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's email notification configuration."""
    result = await db.execute(
        select(EmailNotificationConfig).where(EmailNotificationConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()
    if config is None:
        return NotificationConfigResponse(
            enabled=False, notification_email="", events=[], rate_limit_per_hour=10,
        )
    return config


@router.put("/config", response_model=NotificationConfigResponse)
async def update_notification_config(
    data: NotificationConfigRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the current user's email notification configuration."""
    invalid = [e for e in data.events if e not in WEBHOOK_EVENT_TYPES]
    if invalid:
        raise HTTPException(400, f"Invalid event types: {invalid}")

    result = await db.execute(
        select(EmailNotificationConfig).where(EmailNotificationConfig.user_id == user.id)
    )
    config = result.scalar_one_or_none()

    if config is None:
        config = EmailNotificationConfig(user_id=user.id)
        db.add(config)

    config.enabled = data.enabled
    config.notification_email = data.notification_email.strip()
    config.events = data.events
    config.rate_limit_per_hour = data.rate_limit_per_hour
    await db.flush()
    return config



@router.get("/events")
async def notification_events_sse(request: Request, user=Depends(get_current_user)):
    """SSE endpoint — pushes real-time notification events to the connected client."""
    queue = await notification_events.subscribe(user.id)

    async def stream():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                data = json.dumps(event, default=str)
                yield f"event: notification.new\ndata: {data}\n\n"
        finally:
            await notification_events.unsubscribe(user.id, queue)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)