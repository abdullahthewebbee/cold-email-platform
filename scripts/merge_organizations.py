"""Merge two organizations into one.

Moves all campaigns, leads, inboxes, webhooks, suppression entries, and
user accounts from the SOURCE org into the TARGET org, then deletes the
now-empty source organization. Both logins keep working afterward and see
the same combined data.

DRY RUN BY DEFAULT — shows a report of what would happen without changing
anything. Add --confirm to actually execute.

Usage:
    python scripts/merge_organizations.py --source-email you@old.com --target-email you@new.com
    python scripts/merge_organizations.py --source-email you@old.com --target-email you@new.com --confirm
"""
import os
import sys
import asyncio
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select, func
from app.database import AsyncSessionLocal
from app.models import User, Organization, Campaign, Inbox, Lead, Webhook, SuppressionEntry


async def find_org_by_email(db, email: str):
    result = await db.execute(select(User).where(User.email == email.strip().lower()))
    user = result.scalar_one_or_none()
    if not user:
        print(f"ERROR: no user found with email {email}")
        return None, None
    if user.org_id is None:
        print(f"ERROR: user {email} has no organization")
        return None, None
    org = await db.get(Organization, user.org_id)
    return org, user


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-email", required=True, help="Login email of the org being absorbed")
    parser.add_argument("--target-email", required=True, help="Login email of the org to keep everything under")
    parser.add_argument("--confirm", action="store_true", help="Actually execute (default is dry-run report only)")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        source_org, source_user = await find_org_by_email(db, args.source_email)
        target_org, target_user = await find_org_by_email(db, args.target_email)
        if not source_org or not target_org:
            return
        if source_org.id == target_org.id:
            print("ERROR: source and target emails are already in the same organization — nothing to merge.")
            return

        print(f"SOURCE org id={source_org.id} (from {args.source_email})")
        print(f"TARGET org id={target_org.id} (from {args.target_email})")
        print()

        campaigns = (await db.execute(select(Campaign).where(Campaign.org_id == source_org.id))).scalars().all()
        inboxes = (await db.execute(select(Inbox).where(Inbox.org_id == source_org.id))).scalars().all()
        leads = (await db.execute(select(Lead).where(Lead.org_id == source_org.id))).scalars().all()
        webhooks = (await db.execute(select(Webhook).where(Webhook.org_id == source_org.id))).scalars().all()
        suppressions = (await db.execute(select(SuppressionEntry).where(SuppressionEntry.org_id == source_org.id))).scalars().all()
        source_users = (await db.execute(select(User).where(User.org_id == source_org.id))).scalars().all()

        print(f"Will move: {len(campaigns)} campaigns, {len(inboxes)} inboxes, {len(leads)} leads, "
              f"{len(webhooks)} webhooks, {len(suppressions)} suppression entries, {len(source_users)} user account(s)")
        print()

        # --- Conflict checks ---
        target_lead_emails = {
            r[0] for r in (await db.execute(select(Lead.email).where(Lead.org_id == target_org.id))).all()
        }
        source_lead_emails = {l.email for l in leads}
        dup_leads = target_lead_emails & source_lead_emails
        if dup_leads:
            print(f"⚠️  {len(dup_leads)} lead email(s) exist in BOTH orgs — after merge these leads will "
                  f"exist as two separate records (their campaign history stays split, not automatically combined).")
            for e in list(dup_leads)[:10]:
                print(f"    - {e}")
            if len(dup_leads) > 10:
                print(f"    ... and {len(dup_leads) - 10} more")
            print()

        target_inbox_emails = {
            r[0] for r in (await db.execute(select(Inbox.email).where(Inbox.org_id == target_org.id))).all()
        }
        source_inbox_emails = {i.email for i in inboxes}
        dup_inboxes = target_inbox_emails & source_inbox_emails
        if dup_inboxes:
            print(f"⚠️  {len(dup_inboxes)} inbox(es) with the same email are connected in BOTH orgs:")
            for e in dup_inboxes:
                print(f"    - {e}")
            print(f"    Both will exist after merge — you may want to manually remove the duplicate afterward.")
            print()

        if not args.confirm:
            print("=" * 60)
            print("DRY RUN ONLY — nothing was changed.")
            print("Review the report above, then re-run with --confirm to execute.")
            print("=" * 60)
            return

        # --- Execute the merge ---
        for c in campaigns:
            c.org_id = target_org.id
        for i in inboxes:
            i.org_id = target_org.id
        for l in leads:
            l.org_id = target_org.id
        for w in webhooks:
            w.org_id = target_org.id
        for s in suppressions:
            s.org_id = target_org.id
        for u in source_users:
            u.org_id = target_org.id

        await db.flush()
        await db.delete(source_org)
        await db.commit()

        print("✅ Merge complete.")
        print(f"Organization {source_org.id} has been deleted; everything now lives under organization {target_org.id}.")
        print(f"Both {args.source_email} and {args.target_email} can log in and see the same combined data.")


if __name__ == "__main__":
    asyncio.run(main())