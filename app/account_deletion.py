"""Full account/organization data deletion.

Deletes everything belonging to an Organization: campaigns (and their
sequences, branch trees, queue slots, leads' campaign enrollments),
inboxes (and their OAuth accounts, synced messages/threads), leads,
webhooks, users, and the organization itself.

Used by the self-service "delete my account" flow (DELETE /api/auth/me).
This is destructive and irreversible — callers must confirm intent before
calling this.
"""
import logging

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Organization, User, Campaign, Inbox, Lead, Webhook,
    LeadUnsubscribeToken, EmailLog, LeadReply,
    GmailAccount, GmailSyncState, GmailMessage, GmailThread,
    Office365Account, Office365SyncState, Office365Message, Office365Thread,
)

log = logging.getLogger("quickly.account_deletion")


async def delete_organization_and_data(db: AsyncSession, org_id: int) -> None:
    # ── Campaigns (ORM cascade handles sequences, campaign_leads, queue
    # slots, campaign_inboxes, branch-tree nodes/edges — same pattern as
    # the existing single-campaign delete endpoint) ──────────────────────
    campaigns = (await db.execute(select(Campaign).where(Campaign.org_id == org_id))).scalars().all()
    for campaign in campaigns:
        await db.execute(delete(LeadUnsubscribeToken).where(LeadUnsubscribeToken.campaign_id == campaign.id))
        await db.delete(campaign)
    await db.flush()

    # ── Inboxes and everything synced through them ───────────────────────
    inboxes = (await db.execute(select(Inbox).where(Inbox.org_id == org_id))).scalars().all()
    for inbox in inboxes:
        await db.execute(delete(GmailAccount).where(GmailAccount.inbox_id == inbox.id))
        await db.execute(delete(GmailSyncState).where(GmailSyncState.inbox_id == inbox.id))
        await db.execute(delete(GmailMessage).where(GmailMessage.inbox_id == inbox.id))
        await db.execute(delete(GmailThread).where(GmailThread.inbox_id == inbox.id))
        await db.execute(delete(Office365Account).where(Office365Account.inbox_id == inbox.id))
        await db.execute(delete(Office365SyncState).where(Office365SyncState.inbox_id == inbox.id))
        await db.execute(delete(Office365Message).where(Office365Message.inbox_id == inbox.id))
        await db.execute(delete(Office365Thread).where(Office365Thread.inbox_id == inbox.id))
        await db.delete(inbox)
    await db.flush()

    # ── Leads (any remaining EmailLog/LeadReply rows — most were already
    # removed via campaign cascade above, this is a defensive cleanup) ────
    leads = (await db.execute(select(Lead).where(Lead.org_id == org_id))).scalars().all()
    lead_ids = [l.id for l in leads]
    if lead_ids:
        await db.execute(delete(EmailLog).where(EmailLog.lead_id.in_(lead_ids)))
        await db.execute(delete(LeadReply).where(LeadReply.lead_id.in_(lead_ids)))
        await db.execute(delete(Lead).where(Lead.id.in_(lead_ids)))

    # ── Webhooks, users, then the organization itself ─────────────────────
    await db.execute(delete(Webhook).where(Webhook.org_id == org_id))
    await db.execute(delete(User).where(User.org_id == org_id))
    await db.execute(delete(Organization).where(Organization.id == org_id))
    await db.flush()

    log.info("delete_organization_and_data: org=%s fully deleted (%d campaigns, %d inboxes, %d leads)",
              org_id, len(campaigns), len(inboxes), len(lead_ids))