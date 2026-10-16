"""Global suppression list — an org-wide "never contact again" list.

Unlike per-campaign unsubscribes (which only stop one campaign), a
suppression entry blocks an email address from being enrolled in ANY
campaign for that organization, forever, until manually removed.
"""
import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SuppressionEntry

log = logging.getLogger("quickly.suppression")


async def add_to_suppression_list(
    db: AsyncSession,
    org_id: int | None,
    email: str,
    reason: str = "manual",
    source_campaign_id: int | None = None,
) -> None:
    """Add an email to the suppression list. Safe to call repeatedly —
    does nothing if the email is already suppressed for this org."""
    email = (email or "").strip().lower()
    if not email:
        return
    stmt = (
        pg_insert(SuppressionEntry)
        .values(org_id=org_id, email=email, reason=reason, source_campaign_id=source_campaign_id)
        .on_conflict_do_nothing(index_elements=["org_id", "email"])
    )
    await db.execute(stmt)
    log.info("add_to_suppression_list: org=%s email=%s reason=%s", org_id, email, reason)


async def get_suppressed_emails_set(db: AsyncSession, org_id: int | None) -> set[str]:
    """Fetch every suppressed email for this org as a lowercase set, for
    fast in-memory membership checks when processing many leads at once."""
    result = await db.execute(select(SuppressionEntry.email).where(SuppressionEntry.org_id == org_id))
    return {row[0] for row in result.all()}


async def is_suppressed(db: AsyncSession, org_id: int | None, email: str) -> bool:
    email = (email or "").strip().lower()
    if not email:
        return False
    result = await db.execute(
        select(SuppressionEntry.id).where(SuppressionEntry.org_id == org_id, SuppressionEntry.email == email)
    )
    return result.scalar_one_or_none() is not None