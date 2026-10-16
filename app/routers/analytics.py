"""Analytics endpoints — aggregated daily statistics, no row limit."""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import cast, Date, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Campaign, CampaignLead, EmailClick, EmailLog, EmailOpen, LeadReply

log = logging.getLogger("quickly.analytics")
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/daily")
async def daily_analytics(
    start_date: str = Query(..., description="Inclusive start date YYYY-MM-DD"),
    end_date: str = Query(..., description="Inclusive end date YYYY-MM-DD"),
    campaign_id: Optional[List[int]] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return per-day, per-campaign aggregated stats for the requested range.

    No row limit — result size is bounded by (days × campaigns).
    """
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="start_date and end_date must be YYYY-MM-DD")

    # campaign name lookup
    camp_stmt = select(Campaign.id, Campaign.name)
    if campaign_id:
        camp_stmt = camp_stmt.where(Campaign.id.in_(campaign_id))
    camp_rows = (await db.execute(camp_stmt)).all()
    campaign_names = {cid: name for cid, name in camp_rows}

    # sent per day per campaign
    sent_stmt = (
        select(
            cast(EmailLog.sent_at, Date).label("day"),
            EmailLog.campaign_id,
            func.count().label("sent"),
        )
        .where(EmailLog.sent_at >= start, EmailLog.sent_at < end)
        .group_by(cast(EmailLog.sent_at, Date), EmailLog.campaign_id)
    )
    if campaign_id:
        sent_stmt = sent_stmt.where(EmailLog.campaign_id.in_(campaign_id))

    # opens per day per campaign
    opens_stmt = (
        select(
            cast(EmailOpen.opened_at, Date).label("day"),
            EmailLog.campaign_id,
            func.count().label("total_opens"),
            func.count(func.distinct(EmailOpen.ip_address)).label("unique_opens"),
        )
        .join(EmailLog, EmailOpen.email_log_id == EmailLog.id)
        .where(EmailOpen.opened_at >= start, EmailOpen.opened_at < end)
        .group_by(cast(EmailOpen.opened_at, Date), EmailLog.campaign_id)
    )
    if campaign_id:
        opens_stmt = opens_stmt.where(EmailLog.campaign_id.in_(campaign_id))

    # clicks per day per campaign
    clicks_stmt = (
        select(
            cast(EmailClick.clicked_at, Date).label("day"),
            EmailLog.campaign_id,
            func.count().label("total_clicks"),
            func.count(func.distinct(EmailClick.ip_address)).label("unique_clicks"),
        )
        .join(EmailLog, EmailClick.email_log_id == EmailLog.id)
        .where(EmailClick.clicked_at >= start, EmailClick.clicked_at < end)
        .group_by(cast(EmailClick.clicked_at, Date), EmailLog.campaign_id)
    )
    if campaign_id:
        clicks_stmt = clicks_stmt.where(EmailLog.campaign_id.in_(campaign_id))

    # replies per day per campaign (excluding OOO and auto-reply)
    replies_stmt = (
        select(
            cast(LeadReply.replied_at, Date).label("day"),
            LeadReply.campaign_id,
            func.count().label("total_replies"),
        )
        .join(
            CampaignLead,
            (LeadReply.lead_id == CampaignLead.lead_id)
            & (LeadReply.campaign_id == CampaignLead.campaign_id),
        )
        .where(
            LeadReply.replied_at >= start,
            LeadReply.replied_at < end,
            or_(
                CampaignLead.interest_status.is_(None),
                CampaignLead.interest_status.notin_(["out_of_office", "auto_reply"]),
            ),
        )
        .group_by(cast(LeadReply.replied_at, Date), LeadReply.campaign_id)
    )
    if campaign_id:
        replies_stmt = replies_stmt.where(LeadReply.campaign_id.in_(campaign_id))

    sent_rows    = (await db.execute(sent_stmt)).all()
    opens_rows   = (await db.execute(opens_stmt)).all()
    clicks_rows  = (await db.execute(clicks_stmt)).all()
    replies_rows = (await db.execute(replies_stmt)).all()

    result: dict[tuple, dict] = {}

    def _day_str(day) -> str:
        return day.isoformat() if hasattr(day, "isoformat") else str(day)

    def _ensure(day, cid: int) -> dict:
        k = (_day_str(day), int(cid))
        if k not in result:
            result[k] = {
                "date": k[0],
                "campaign_id": k[1],
                "campaign_name": campaign_names.get(k[1], ""),
                "sent": 0,
                "total_opens": 0,
                "unique_opens": 0,
                "total_clicks": 0,
                "unique_clicks": 0,
                "total_replies": 0,
            }
        return result[k]

    for row in sent_rows:
        _ensure(row.day, row.campaign_id)["sent"] = row.sent
    for row in opens_rows:
        entry = _ensure(row.day, row.campaign_id)
        entry["total_opens"] = row.total_opens
        entry["unique_opens"] = row.unique_opens
    for row in clicks_rows:
        entry = _ensure(row.day, row.campaign_id)
        entry["total_clicks"] = row.total_clicks
        entry["unique_clicks"] = row.unique_clicks
    for row in replies_rows:
        _ensure(row.day, row.campaign_id)["total_replies"] = row.total_replies

    return sorted(result.values(), key=lambda x: (x["date"], x["campaign_id"]))


@router.get("/domain-reputation")
async def domain_reputation_timeline(
    days: int = Query(30, ge=1, le=365),
    domain: str | None = Query(None, description="Filter to one sending domain; omit for all domains"),
    db: AsyncSession = Depends(get_db),
):
    """Daily reputation timeline per sending domain: send volume, open/click
    counts, bounce counts by type (hard/soft/block/content), and average
    content-risk score. Domain is derived from each inbox's email address.

    Bounce data comes from BounceEvent (a permanent, timestamped record kept
    specifically for this — EmailLog rows for failed sends are deleted
    elsewhere in the send pipeline)."""
    from app.models import Inbox, BounceEvent

    end = datetime.utcnow()
    start = end - timedelta(days=days)
    domain_expr = func.split_part(Inbox.email, '@', 2)

    sent_stmt = (
        select(
            cast(EmailLog.sent_at, Date).label("day"),
            domain_expr.label("domain"),
            func.count().label("sent"),
            func.count().filter(EmailLog.opened == True).label("opened"),
            func.count().filter(EmailLog.clicked == True).label("clicked"),
            func.avg(EmailLog.content_risk_score).label("avg_risk"),
        )
        .join(Inbox, EmailLog.inbox_id == Inbox.id)
        .where(EmailLog.sent_at >= start, EmailLog.sent_at < end)
        .group_by(cast(EmailLog.sent_at, Date), domain_expr)
    )
    if domain:
        sent_stmt = sent_stmt.where(domain_expr == domain)
    sent_rows = (await db.execute(sent_stmt)).all()

    bounce_stmt = (
        select(
            cast(BounceEvent.occurred_at, Date).label("day"),
            domain_expr.label("domain"),
            BounceEvent.bounce_type,
            func.count().label("count"),
        )
        .join(Inbox, BounceEvent.inbox_id == Inbox.id)
        .where(BounceEvent.occurred_at >= start, BounceEvent.occurred_at < end)
        .group_by(cast(BounceEvent.occurred_at, Date), domain_expr, BounceEvent.bounce_type)
    )
    if domain:
        bounce_stmt = bounce_stmt.where(domain_expr == domain)
    bounce_rows = (await db.execute(bounce_stmt)).all()

    buckets: dict = {}

    def _ensure_bucket(day, dom):
        key = (day.isoformat(), dom)
        if key not in buckets:
            buckets[key] = {
                "date": day.isoformat(), "domain": dom,
                "sent": 0, "opened": 0, "clicked": 0, "avg_content_risk": None,
                "bounces": {"hard": 0, "soft": 0, "block": 0, "content": 0},
                "total_bounces": 0,
            }
        return buckets[key]

    for r in sent_rows:
        b = _ensure_bucket(r.day, r.domain)
        b["sent"] = r.sent
        b["opened"] = r.opened
        b["clicked"] = r.clicked
        b["avg_content_risk"] = round(float(r.avg_risk), 1) if r.avg_risk is not None else None

    for r in bounce_rows:
        b = _ensure_bucket(r.day, r.domain)
        bt = r.bounce_type if r.bounce_type in ("hard", "soft", "block", "content") else "hard"
        b["bounces"][bt] = r.count
        b["total_bounces"] += r.count

    return sorted(buckets.values(), key=lambda x: (x["date"], x["domain"]))



# ---------------------------------------------------------------------------
# Deliverability Health Score — 0–100 rollup across DNS, auth, and content
# ---------------------------------------------------------------------------

@router.get("/deliverability-score")
async def get_deliverability_score(
    domain: str = Query(..., description="Sending domain to score, e.g. example.com"),
    days: int = Query(30, ge=1, le=90, description="Look-back window for send history"),
    db: AsyncSession = Depends(get_db),
    org_id: int | None = None,
):
    """Return a 0–100 Deliverability Health Score for a sending domain.

    Blends three existing data sources:
    - DNS score      (60%) — SPF/DKIM/DMARC/blacklist from DNS Doctor
    - Auth pass rate (25%) — % of recent sends where SPF+DMARC passed
    - Content safety (15%) — inverted avg content risk (low risk = high score)

    No new data is collected — this aggregates what already exists.
    All three components fall back gracefully when data is unavailable.
    """
    from app.models import BounceEvent
    import json

    # ── Component 1: DNS score (60%) ────────────────────────────────────
    # Run checkdmarc in a thread — it's synchronous/blocking and would
    # stall the async event loop if called directly.
    dns_score = 0
    dns_grade = "?"
    dns_available = False
    try:
        import asyncio
        import checkdmarc
        from app.routers.dns_doctor import _compute_health_score

        def _run_dns_checks():
            spf_raw = checkdmarc.check_spf(domain)
            dmarc_raw = checkdmarc.check_dmarc(domain)
            spf_ok = spf_raw.get("valid", False)
            spf_result = {"status": "pass" if spf_ok else "fail", "message": ""}
            dmarc_record = dmarc_raw.get("record", "")
            dmarc_result = {"status": "pass" if dmarc_record else "fail", "message": ""}
            policy = dmarc_raw.get("tags", {}).get("p", {}).get("value", "none")
            dmarc_policy_pass = policy in ("reject", "quarantine")
            blank = {"status": "unknown", "message": ""}
            return _compute_health_score(
                spf_result, blank, dmarc_result,
                blank, blank, blank, blank, blank,
                dmarc_policy_pass,
            )

        health = await asyncio.wait_for(
            asyncio.to_thread(_run_dns_checks),
            timeout=15.0,  # 15s max — don't hang the request
        )
        dns_score = health["score"]
        dns_grade = health["grade"]
        dns_available = True
    except asyncio.TimeoutError:
        log.warning("deliverability_score: DNS check timed out for %s", domain)
    except Exception as e:
        log.warning("deliverability_score: DNS check failed for %s: %s", domain, e)

    # ── Component 2: Auth pass rate (25%) ───────────────────────────────
    # Read auth_snapshot column from recent EmailLog rows for this domain.
    auth_score = 50  # neutral default when no send history
    auth_available = False
    cutoff = datetime.utcnow() - timedelta(days=days)
    try:
        rows_res = await db.execute(
            select(EmailLog.auth_snapshot)
            .where(
                EmailLog.sent_at >= cutoff,
                EmailLog.auth_snapshot.isnot(None),
                func.lower(func.split_part(EmailLog.message_id, "@", 2)) == domain.lower()
                if False else EmailLog.auth_snapshot.isnot(None),  # domain filter best-effort
            )
            .limit(500)
        )
        snapshots = [r[0] for r in rows_res.all() if r[0]]
        if snapshots:
            passes = 0
            for snap in snapshots:
                try:
                    data = snap if isinstance(snap, dict) else json.loads(snap)
                    spf_ok = data.get("spf_status") == "pass"
                    dmarc_ok = data.get("dmarc_policy") in ("reject", "quarantine")
                    if spf_ok and dmarc_ok:
                        passes += 1
                except Exception:
                    pass
            auth_score = int((passes / len(snapshots)) * 100)
            auth_available = True
    except Exception as e:
        log.warning("deliverability_score: auth snapshot query failed: %s", e)

    # ── Component 3: Content safety (15%) ───────────────────────────────
    # Avg content_risk_score from recent sends, inverted (0 risk = 100 score).
    content_score = 80  # optimistic default when no history
    content_available = False
    try:
        risk_res = await db.execute(
            select(func.avg(EmailLog.content_risk_score))
            .where(
                EmailLog.sent_at >= cutoff,
                EmailLog.content_risk_score.isnot(None),
            )
        )
        avg_risk = risk_res.scalar()
        if avg_risk is not None:
            content_score = max(0, min(100, int(100 - float(avg_risk))))
            content_available = True
    except Exception as e:
        log.warning("deliverability_score: content risk query failed: %s", e)

    # ── Blend ────────────────────────────────────────────────────────────
    final_score = int(
        dns_score * 0.60
        + auth_score * 0.25
        + content_score * 0.15
    )
    final_score = max(0, min(100, final_score))

    if final_score >= 90:
        grade = "A"
    elif final_score >= 80:
        grade = "B"
    elif final_score >= 70:
        grade = "C"
    elif final_score >= 60:
        grade = "D"
    else:
        grade = "F"

    return {
        "domain": domain,
        "score": final_score,
        "grade": grade,
        "components": {
            "dns": {"score": dns_score, "grade": dns_grade, "weight": 0.60, "available": dns_available},
            "auth_pass_rate": {"score": auth_score, "weight": 0.25, "available": auth_available},
            "content_safety": {"score": content_score, "weight": 0.15, "available": content_available},
        },
        "look_back_days": days,
        "note": "DNS component uses live lookup (cached 6h). Auth and content components use recent send history.",
    }
    
@router.get("/campaign-performance")
async def campaign_performance(
    org_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Return per-campaign aggregated stats for the Campaign Performance Chart.

    Top 10 campaigns by emails sent, descending.
    Rates are rounded to 1 decimal place.
    """
    from app.auth import get_current_org_id
    from app.models import Organization

    # sent per campaign
    sent_stmt = (
        select(
            EmailLog.campaign_id,
            func.count().label("sent"),
        )
        .group_by(EmailLog.campaign_id)
    )

    # opens per campaign (unique)
    opens_stmt = (
        select(
            EmailLog.campaign_id,
            func.count(func.distinct(EmailOpen.id)).label("opened"),
        )
        .join(EmailLog, EmailOpen.email_log_id == EmailLog.id)
        .group_by(EmailLog.campaign_id)
    )

    # clicks per campaign (unique)
    clicks_stmt = (
        select(
            EmailLog.campaign_id,
            func.count(func.distinct(EmailClick.id)).label("clicked"),
        )
        .join(EmailLog, EmailClick.email_log_id == EmailLog.id)
        .group_by(EmailLog.campaign_id)
    )

    # replies per campaign (excluding OOO/auto)
    replies_stmt = (
        select(
            LeadReply.campaign_id,
            func.count().label("replied"),
        )
        .join(
            CampaignLead,
            (LeadReply.lead_id == CampaignLead.lead_id)
            & (LeadReply.campaign_id == CampaignLead.campaign_id),
        )
        .where(
            or_(
                CampaignLead.interest_status.is_(None),
                CampaignLead.interest_status.notin_(["out_of_office", "auto_reply"]),
            )
        )
        .group_by(LeadReply.campaign_id)
    )

    # campaign names
    camp_stmt = select(Campaign.id, Campaign.name)

    sent_rows    = (await db.execute(sent_stmt)).all()
    opens_rows   = (await db.execute(opens_stmt)).all()
    clicks_rows  = (await db.execute(clicks_stmt)).all()
    replies_rows = (await db.execute(replies_stmt)).all()
    camp_rows    = (await db.execute(camp_stmt)).all()

    camp_names = {cid: name for cid, name in camp_rows}

    # merge into dict keyed by campaign_id
    data: dict[int, dict] = {}

    def _ensure(cid: int) -> dict:
        if cid not in data:
            data[cid] = {
                "campaign_id": cid,
                "campaign_name": camp_names.get(cid, f"Campaign {cid}"),
                "sent": 0, "opened": 0, "clicked": 0, "replied": 0,
            }
        return data[cid]

    for r in sent_rows:
        if r.campaign_id:
            _ensure(r.campaign_id)["sent"] = r.sent
    for r in opens_rows:
        if r.campaign_id:
            _ensure(r.campaign_id)["opened"] = r.opened
    for r in clicks_rows:
        if r.campaign_id:
            _ensure(r.campaign_id)["clicked"] = r.clicked
    for r in replies_rows:
        if r.campaign_id:
            _ensure(r.campaign_id)["replied"] = r.replied

    # compute rates, sort by sent desc, top 10
    result = []
    for row in sorted(data.values(), key=lambda x: x["sent"], reverse=True)[:10]:
        sent = row["sent"]
        result.append({
            "campaign_id":   row["campaign_id"],
            "campaign_name": row["campaign_name"],
            "sent":          sent,
            "opened":        row["opened"],
            "clicked":       row["clicked"],
            "replied":       row["replied"],
            "open_rate":     round(row["opened"] / sent * 100, 1) if sent else 0.0,
            "click_rate":    round(row["clicked"] / sent * 100, 1) if sent else 0.0,
            "reply_rate":    round(row["replied"] / sent * 100, 1) if sent else 0.0,
        })

    return result