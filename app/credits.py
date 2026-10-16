"""
AI credit helpers for Emissary.

Bypass accounts always return unlimited credits.
All other orgs are checked against the ai_credits table.
"""
from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiCredits, BYPASS_ORGS_EMAILS

logger = logging.getLogger("quickly.credits")

# Credits deducted per AI call per model
MODEL_COSTS: dict[str, int] = {
    "gemini": 1,
    "deepseek": 2,
    "claude": 5,
}

ModelChoice = Literal["gemini", "deepseek", "claude"]


async def is_bypass_org(db: AsyncSession, org_id: int) -> bool:
    """Return True if this org belongs to a bypass account (unlimited AI)."""
    from app.models import User
    result = await db.execute(
        select(User.email).where(User.org_id == org_id)
    )
    emails = {row[0] for row in result.fetchall()}
    return bool(emails & BYPASS_ORGS_EMAILS)


async def _get_or_create_credits(db: AsyncSession, org_id: int) -> AiCredits:
    """Fetch the AiCredits row for an org, creating it with 0 credits if missing."""
    result = await db.execute(
        select(AiCredits).where(AiCredits.org_id == org_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = AiCredits(org_id=org_id, credits_remaining=0, semi_manual_model="deepseek", full_ai_model="deepseek")
        db.add(row)
        await db.flush()
    return row


async def get_org_credits(db: AsyncSession, org_id: int) -> int:
    """Return current credit balance. Bypass orgs return 999999."""
    if await is_bypass_org(db, org_id):
        return 999999
    row = await _get_or_create_credits(db, org_id)
    return row.credits_remaining


async def get_model_preference(db: AsyncSession, org_id: int, mode: str = "semi_manual") -> ModelChoice:
    """Return the org's selected AI model for a given campaign mode (default: gemini)."""
    row = await _get_or_create_credits(db, org_id)
    if mode == "full_ai":
        pref = row.full_ai_model or "gemini"
    else:
        pref = row.semi_manual_model or "gemini"
    if pref not in MODEL_COSTS:
        pref = "gemini"
    return pref  # type: ignore[return-value]


async def deduct_credits(db: AsyncSession, org_id: int, model: ModelChoice) -> bool:
    """
    Deduct credits for one AI call.
    Returns True if deducted (or bypass), False if insufficient credits.
    """
    if await is_bypass_org(db, org_id):
        logger.debug("credits: bypass org %s — no deduction", org_id)
        return True

    cost = MODEL_COSTS.get(model, 1)
    row = await _get_or_create_credits(db, org_id)

    if row.credits_remaining < cost:
        logger.warning(
            "credits: org %s has %d credits, need %d for model %s",
            org_id, row.credits_remaining, cost, model,
        )
        return False

    row.credits_remaining -= cost
    await db.flush()
    logger.info(
        "credits: org %s deducted %d for model %s, remaining=%d",
        org_id, cost, model, row.credits_remaining,
    )
    return True


async def add_credits(db: AsyncSession, org_id: int, amount: int) -> int:
    """Top up credits (called from Stripe webhook). Returns new balance."""
    row = await _get_or_create_credits(db, org_id)
    row.credits_remaining += amount
    await db.flush()
    logger.info("credits: org %s topped up by %d, new balance=%d", org_id, amount, row.credits_remaining)
    return row.credits_remaining


async def set_model_preference(db: AsyncSession, org_id: int, model: ModelChoice, mode: str = "semi_manual") -> None:
    """Save org's model preference for a given campaign mode."""
    row = await _get_or_create_credits(db, org_id)
    if mode == "full_ai":
        row.full_ai_model = model
    else:
        row.semi_manual_model = model
    await db.flush()