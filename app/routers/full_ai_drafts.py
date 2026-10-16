"""Endpoints for reviewing and approving Full AI mode drafts."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_org_id
from app.models import Campaign, CampaignLead, Lead, Sequence, CustomEmailOverride, FullAIDraft

log = logging.getLogger("quickly.full_ai_drafts")
router = APIRouter(prefix="/api/campaigns", tags=["full-ai-drafts"])


async def _get_org_campaign(campaign_id: int, db: AsyncSession, org_id: int | None) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.org_id == org_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    return campaign


@router.get("/{campaign_id}/full-ai-drafts")
async def list_full_ai_drafts(
    campaign_id: int,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    """List pending AI-written drafts awaiting approval for a Full AI campaign."""
    await _get_org_campaign(campaign_id, db, org_id)
    rows = await db.execute(
        select(FullAIDraft, CampaignLead, Lead)
        .join(CampaignLead, CampaignLead.id == FullAIDraft.campaign_lead_id)
        .join(Lead, Lead.id == CampaignLead.lead_id)
        .where(CampaignLead.campaign_id == campaign_id, FullAIDraft.status == "pending")
        .order_by(FullAIDraft.created_at)
    )
    return [
        {
            "draft_id": d.id,
            "campaign_lead_id": cl.id,
            "lead_id": lead.id,
            "lead_email": lead.email,
            "lead_name": lead.name,
            "subject": d.subject,
            "body": d.body,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d, cl, lead in rows.all()
    ]


@router.post("/{campaign_id}/full-ai-drafts/{draft_id}/approve")
async def approve_full_ai_draft(
    campaign_id: int,
    draft_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    """Approve a pending draft: copy it into CustomEmailOverride and let the
    normal personalized-send path (reconcile + recalculate) pick it up."""
    campaign = await _get_org_campaign(campaign_id, db, org_id)

    draft_result = await db.execute(
        select(FullAIDraft, CampaignLead)
        .join(CampaignLead, CampaignLead.id == FullAIDraft.campaign_lead_id)
        .where(FullAIDraft.id == draft_id, CampaignLead.campaign_id == campaign_id)
    )
    row = draft_result.first()
    if not row:
        raise HTTPException(404, "Draft not found in this campaign")
    draft, cl = row
    if draft.status != "pending":
        raise HTTPException(400, f"Draft is already '{draft.status}'")

    seq_result = await db.execute(
        select(Sequence).where(
            Sequence.campaign_id == campaign_id,
            Sequence.sequence_type == "personalized",
        )
    )
    sequence = seq_result.scalars().first()
    if not sequence:
        raise HTTPException(400, "Campaign has no personalized sequence step (should not happen for full_ai)")

    ov_result = await db.execute(
        select(CustomEmailOverride).where(
            CustomEmailOverride.campaign_lead_id == cl.id,
            CustomEmailOverride.sequence_id == sequence.id,
        )
    )
    override = ov_result.scalar_one_or_none()
    if override:
        override.subject = draft.subject
        override.body = draft.body
        override.is_html = False
    else:
        override = CustomEmailOverride(
            campaign_lead_id=cl.id,
            sequence_id=sequence.id,
            subject=draft.subject,
            body=draft.body,
            is_html=False,
        )
        db.add(override)

    draft.status = "approved"

    if cl.enrollment_status == "needs_custom_email":
        cl.enrollment_status = "active"

    await db.flush()
    await db.commit()

    from app.routers.schedule import enqueue_global_recalculate
    enqueue_global_recalculate(background_tasks)

    log.info("approve_full_ai_draft: campaign=%s draft=%s campaign_lead=%s approved", campaign_id, draft_id, cl.id)
    return {"ok": True, "draft_id": draft_id, "campaign_lead_id": cl.id}


@router.post("/{campaign_id}/full-ai-drafts/{draft_id}/reject")
async def reject_full_ai_draft(
    campaign_id: int,
    draft_id: int,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    """Reject a pending draft. The lead is left untouched (no auto-retry);
    a future run_full_ai_job pass will not re-draft it since a FullAIDraft
    row already exists for this campaign_lead."""
    await _get_org_campaign(campaign_id, db, org_id)

    draft_result = await db.execute(
        select(FullAIDraft)
        .join(CampaignLead, CampaignLead.id == FullAIDraft.campaign_lead_id)
        .where(FullAIDraft.id == draft_id, CampaignLead.campaign_id == campaign_id)
    )
    draft = draft_result.scalar_one_or_none()
    if not draft:
        raise HTTPException(404, "Draft not found in this campaign")
    if draft.status != "pending":
        raise HTTPException(400, f"Draft is already '{draft.status}'")

    draft.status = "rejected"
    await db.flush()
    await db.commit()

    log.info("reject_full_ai_draft: campaign=%s draft=%s rejected", campaign_id, draft_id)
    return {"ok": True, "draft_id": draft_id}