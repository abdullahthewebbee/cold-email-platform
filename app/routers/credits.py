"""
API endpoints for AI credit balance and model preference.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.credits import (
    MODEL_COSTS,
    add_credits,
    get_model_preference,
    get_org_credits,
    set_model_preference,
)
from app.database import get_db
from app.auth import get_current_org_id

router = APIRouter(prefix="/api/credits", tags=["credits"])


class ModelUpdateRequest(BaseModel):
    model: str  # gemini | deepseek | claude
    mode: str = "semi_manual"  # semi_manual | full_ai


class AddCreditsRequest(BaseModel):
    amount: int
    org_id: int | None = None  # None = current org


# ---------------------------------------------------------------------------
# GET /api/credits/balance
# ---------------------------------------------------------------------------
@router.get("/balance")
async def get_balance(
    org_id: int = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    balance = await get_org_credits(db, org_id)
    model = await get_model_preference(db, org_id)
    semi_model = await get_model_preference(db, org_id, "semi_manual")
    full_model = await get_model_preference(db, org_id, "full_ai")
    return {
        "credits_remaining": balance,
        "semi_manual_model": semi_model,
        "full_ai_model": full_model,
        "model_cost_semi": MODEL_COSTS.get(semi_model, 1),
        "model_cost_full": MODEL_COSTS.get(full_model, 1),
        "is_unlimited": balance == 999999,
    }


# ---------------------------------------------------------------------------
# POST /api/credits/model
# ---------------------------------------------------------------------------
@router.post("/model")
async def update_model(
    body: ModelUpdateRequest,
    org_id: int = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    if body.model not in MODEL_COSTS:
        raise HTTPException(400, f"Invalid model. Choose from: {list(MODEL_COSTS.keys())}")
    if body.mode not in ("semi_manual", "full_ai"):
        raise HTTPException(400, "Invalid mode. Choose: semi_manual or full_ai")
    await set_model_preference(db, org_id, body.model, body.mode)  # type: ignore[arg-type]
    await db.commit()
    return {"ok": True, "model_preference": body.model}


# ---------------------------------------------------------------------------
# POST /api/credits/add  (admin / testing)
# ---------------------------------------------------------------------------
@router.post("/add")
async def add_credits_endpoint(
    body: AddCreditsRequest,
    org_id: int = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
):
    target_org = body.org_id if body.org_id is not None else org_id
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    new_balance = await add_credits(db, target_org, body.amount)
    await db.commit()
    return {"ok": True, "credits_remaining": new_balance}