"""Campaign Health Watchdog: periodic threshold checks (bounce rate, open
rate) that fire in-app notifications + webhooks when a campaign's health
crosses a line. Reuses the existing Notifications system.

Runs on a schedule (see main.py) rather than per-event, since these are
aggregate metrics best evaluated over a window, not single occurrences.
Alerts are throttled (won't re-fire the same alert for the same campaign
within ALERT_COOLDOWN_HOURS) by checking recent Notification rows.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Campaign, EmailLog, BounceEvent, Notification, User
from app import time as time_provider

log = logging.getLogger("quickly.campaign_health_watchdog")

BOUNCE_RATE_THRESHOLD_PERCENT = 5.0
LOW_OPEN_RATE_THRESHOLD_PERCENT = 15.0
MIN_SAMPLE_SIZE = 20
ALERT_COOLDOWN_HOURS = 24


async def _recently_alerted(db: AsyncSession, campaign_id: int, event_type: str) -> bool:
    cutoff = time_provider.utcnow() - timedelta(hours=ALERT_COOLDOWN_HOURS)
    result = await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.campaign_id == campaign_id,
            Notification.event_type == event_type,
            Notification.created_at >= cutoff,
        )
    )
    return (result.scalar() or 0) > 0


async def _notify_org(db: AsyncSession, campaign: Campaign, event_type: str, title: str, message: str, data: dict):
    users_result = await db.execute(select(User.id).where(User.org_id == campaign.org_id))
    user_ids = [r[0] for r in users_result.all()]
    for uid in user_ids:
        db.add(Notification(
            user_id=uid,
            event_type=event_type,
            title=title,
            message=message,
            data_json=data,
            campaign_id=campaign.id,
        ))
    await db.flush()

    from app.webhooks import fire_webhook_event
    await fire_webhook_event(db, event_type, {
        **data, "campaign_id": campaign.id, "campaign_name": campaign.name,
        "timestamp": time_provider.utcnow().isoformat() + "Z",
    })


async def check_campaign_health(db: AsyncSession, campaign: Campaign) -> list[str]:
    """Evaluate all health rules for one campaign. Returns list of alert types fired."""
    fired = []

    sent_result = await db.execute(
        select(func.count()).select_from(EmailLog).where(EmailLog.campaign_id == campaign.id)
    )
    total_sent = sent_result.scalar() or 0
    if total_sent < MIN_SAMPLE_SIZE:
        return fired

    bounce_result = await db.execute(
        select(func.count()).select_from(BounceEvent).where(BounceEvent.campaign_id == campaign.id)
    )
    total_bounces = bounce_result.scalar() or 0
    bounce_rate = (total_bounces / total_sent) * 100
    if bounce_rate >= BOUNCE_RATE_THRESHOLD_PERCENT:
        event_type = "campaign_health.high_bounce_rate"
        if not await _recently_alerted(db, campaign.id, event_type):
            await _notify_org(
                db, campaign, event_type,
                title=f"High bounce rate: {campaign.name}",
                message=(
                    f"'{campaign.name}' has a {bounce_rate:.1f}% bounce rate "
                    f"({total_bounces} of {total_sent} sends), above the {BOUNCE_RATE_THRESHOLD_PERCENT:.1f}% threshold. "
                    f"Check your lead list quality and sending domain health."
                ),
                data={"bounce_rate": round(bounce_rate, 2), "threshold": BOUNCE_RATE_THRESHOLD_PERCENT,
                      "total_bounces": total_bounces, "total_sent": total_sent},
            )
            fired.append(event_type)

    opened_result = await db.execute(
        select(func.count()).select_from(EmailLog).where(EmailLog.campaign_id == campaign.id, EmailLog.opened == True)
    )
    total_opened = opened_result.scalar() or 0
    open_rate = (total_opened / total_sent) * 100
    if open_rate < LOW_OPEN_RATE_THRESHOLD_PERCENT:
        event_type = "campaign_health.low_open_rate"
        if not await _recently_alerted(db, campaign.id, event_type):
            await _notify_org(
                db, campaign, event_type,
                title=f"Low open rate: {campaign.name}",
                message=(
                    f"'{campaign.name}' has a {open_rate:.1f}% open rate "
                    f"({total_opened} of {total_sent} sends), below the {LOW_OPEN_RATE_THRESHOLD_PERCENT:.1f}% threshold. "
                    f"This can indicate deliverability issues (landing in spam) or weak subject lines."
                ),
                data={"open_rate": round(open_rate, 2), "threshold": LOW_OPEN_RATE_THRESHOLD_PERCENT,
                      "total_opened": total_opened, "total_sent": total_sent},
            )
            fired.append(event_type)

    return fired


async def run_campaign_health_watchdog_job() -> None:
    """Periodic job: check health rules for every active (non-paused) campaign."""
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Campaign).where(Campaign.paused == False))
            campaigns = result.scalars().all()
            total_fired = 0
            for campaign in campaigns:
                fired = await check_campaign_health(db, campaign)
                total_fired += len(fired)
            await db.commit()
            if total_fired:
                log.info(
                    "run_campaign_health_watchdog_job: fired %d alert(s) across %d campaign(s)",
                    total_fired, len(campaigns),
                )
        except Exception:
            await db.rollback()
            log.exception("run_campaign_health_watchdog_job: failed")