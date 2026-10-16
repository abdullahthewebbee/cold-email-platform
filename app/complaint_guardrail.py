"""Complaint Rate Guardrail: auto-pauses a campaign before its spam-complaint
rate crosses a threshold.

Real spam complaints require ISP Feedback Loop registration (Google Postmaster
Tools, Microsoft SNDS/JMRP) — not yet integrated. Until then, this uses
unsubscribe rate as a proxy signal: every unsubscribe logs a ComplaintEvent
with source='unsubscribe_proxy'. A future FBL integration can record
source='fbl' rows the same way — this guardrail's logic doesn't need to change.
"""
from __future__ import annotations

import logging
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Campaign, EmailLog, ComplaintEvent, Notification, User

log = logging.getLogger("quickly.complaint_guardrail")

# Unsubscribe-rate-proxy default. Real FBL complaint-rate thresholds are much
# stricter (industry standard ~0.1-0.3%) since actual "report spam" clicks are
# rarer and more damaging than plain unsubscribes.
DEFAULT_THRESHOLD_PERCENT = 3.0
MIN_SAMPLE_SIZE = 20  # don't evaluate campaigns with too few sends yet — avoids false positives on small volumes


async def check_complaint_guardrail(db: AsyncSession, campaign_id: int) -> dict | None:
    """Check a campaign's complaint (proxy) rate and pause it if over threshold.
    Returns a dict describing the action taken, or None if no action was needed
    (already paused, too few sends yet, or under threshold)."""
    campaign = await db.get(Campaign, campaign_id)
    if not campaign or campaign.paused:
        return None

    sent_result = await db.execute(
        select(func.count()).select_from(EmailLog).where(EmailLog.campaign_id == campaign_id)
    )
    total_sent = sent_result.scalar() or 0
    if total_sent < MIN_SAMPLE_SIZE:
        return None

    complaint_result = await db.execute(
        select(func.count()).select_from(ComplaintEvent).where(ComplaintEvent.campaign_id == campaign_id)
    )
    total_complaints = complaint_result.scalar() or 0

    threshold = campaign.complaint_rate_threshold or DEFAULT_THRESHOLD_PERCENT
    rate_percent = (total_complaints / total_sent) * 100

    if rate_percent < threshold:
        return None

    campaign.paused = True
    await db.flush()

    log.warning(
        "complaint_guardrail: paused campaign_id=%s rate=%.2f%% (%d/%d) threshold=%.2f%%",
        campaign_id, rate_percent, total_complaints, total_sent, threshold,
    )

    users_result = await db.execute(select(User.id).where(User.org_id == campaign.org_id))
    user_ids = [r[0] for r in users_result.all()]
    for uid in user_ids:
        db.add(Notification(
            user_id=uid,
            event_type="campaign_paused_complaint_rate",
            title="Campaign paused: high complaint rate",
            message=(
                f"'{campaign.name}' was automatically paused — its unsubscribe-rate proxy "
                f"({rate_percent:.2f}%) crossed the {threshold:.2f}% threshold "
                f"({total_complaints} of {total_sent} sends). Review before resuming."
            ),
            data_json={"campaign_id": campaign_id, "rate_percent": rate_percent, "threshold": threshold},
            campaign_id=campaign_id,
        ))
    await db.flush()

    from app.webhooks import fire_webhook_event
    from app import time as time_provider
    await fire_webhook_event(db, "campaign.paused_complaint_rate", {
        "campaign_id": campaign_id,
        "campaign_name": campaign.name,
        "rate_percent": round(rate_percent, 2),
        "threshold_percent": threshold,
        "total_complaints": total_complaints,
        "total_sent": total_sent,
        "timestamp": time_provider.utcnow().isoformat() + "Z",
    })

    return {
        "paused": True,
        "rate_percent": round(rate_percent, 2),
        "total_complaints": total_complaints,
        "total_sent": total_sent,
        "threshold_percent": threshold,
    }
    