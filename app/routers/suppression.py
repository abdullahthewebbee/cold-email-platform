"""Global suppression list management API."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_org_id
from app.models import SuppressionEntry

router = APIRouter(prefix="/api/suppression", tags=["suppression"])


class SuppressionCreate(BaseModel):
    email: str
    reason: str = "manual"


@router.get("")
async def list_suppression(
    q: str = "",
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    stmt = select(SuppressionEntry).where(SuppressionEntry.org_id == org_id)
    if q.strip():
        stmt = stmt.where(SuppressionEntry.email.ilike(f"%{q.strip().lower()}%"))
    stmt = stmt.order_by(SuppressionEntry.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {"id": r.id, "email": r.email, "reason": r.reason, "created_at": r.created_at.isoformat() if r.created_at else None}
        for r in rows
    ]


@router.post("")
async def add_suppression(
    data: SuppressionCreate,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    from app.suppression import add_to_suppression_list
    await add_to_suppression_list(db, org_id, data.email, reason=data.reason or "manual")
    await db.commit()
    return {"ok": True}


@router.delete("/{entry_id}")
async def remove_suppression(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    result = await db.execute(
        select(SuppressionEntry).where(SuppressionEntry.id == entry_id, SuppressionEntry.org_id == org_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(404, "Not found")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}