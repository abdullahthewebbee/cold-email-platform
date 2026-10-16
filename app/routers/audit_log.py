"""Audit log read endpoints — list and filter audit events for an org."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_org_id, get_current_user, require_write_access
from app.models import AuditLog, User

log = logging.getLogger("quickly.audit_log")
router = APIRouter(prefix="/api/audit-log", tags=["audit-log"])


@router.get("")
async def list_audit_log(
    action: Optional[str] = Query(None, description="Filter by action, e.g. 'campaign.created'"),
    target_type: Optional[str] = Query(None, description="Filter by target type, e.g. 'campaign'"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    """Return audit log entries for this org, newest first."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.org_id == org_id)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)

    result = await db.execute(stmt)
    entries = result.scalars().all()

    return [
        {
            "id": e.id,
            "action": e.action,
            "target_type": e.target_type,
            "target_id": e.target_id,
            "detail": e.detail,
            "ip_address": e.ip_address,
            "user_id": e.user_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]