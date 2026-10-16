"""Audit log writer — append-only, never raises, never blocks the response.

Usage (inside any async endpoint):
    from app.audit import audit
    await audit(db, request, user, "campaign.created",
                target_type="campaign", target_id=str(campaign.id),
                detail={"name": campaign.name})

Design rules:
- Never raises — a logging failure must never break a user-facing request.
- Fire-and-forget within the same DB session — caller commits as normal.
- org_id and user_id are extracted automatically from the user object.
- ip_address is extracted from the request (respects proxy headers).
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.client_ip import client_ip_from_request

log = logging.getLogger("quickly.audit")


async def audit(
    db: AsyncSession,
    request: Request | None,
    user: Any | None,
    action: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: dict | None = None,
) -> None:
    """Write one audit log entry. Never raises."""
    try:
        from app.models import AuditLog
        entry = AuditLog(
            org_id=getattr(user, "org_id", None),
            user_id=getattr(user, "id", None),
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            detail=detail or {},
            ip_address=client_ip_from_request(request) if request else None,
        )
        db.add(entry)
        # Flush so the row gets a PK but don't commit — caller controls the transaction.
        await db.flush()
    except Exception as exc:
        log.warning("audit: failed to write entry action=%s: %s", action, exc)