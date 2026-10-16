"""Migration: add sequence_node, sequence_edge tables and
campaign_lead.current_node_id column for the visual branch-tree builder.

Additive only — does not touch the existing Sequence/QueueSlot tables or
any running campaign. Safe to run multiple times.
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.database import AsyncSessionLocal, engine
from app.models import Base, SequenceNode, SequenceEdge


async def main():
    # Create the two new tables via SQLAlchemy metadata (safe/idempotent —
    # create_all only creates tables that don't already exist).
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(
                sync_conn, tables=[SequenceNode.__table__, SequenceEdge.__table__]
            )
        )
    print("Created sequence_node and sequence_edge tables (or already existed).")

    async with AsyncSessionLocal() as db:
        result = await db.execute(text("PRAGMA table_info(campaign_lead)"))
        existing_cols = {row[1] for row in result.fetchall()}
        if "current_node_id" not in existing_cols:
            await db.execute(text("ALTER TABLE campaign_lead ADD COLUMN current_node_id INTEGER"))
            await db.commit()
            print("Added campaign_lead.current_node_id column.")
        else:
            print("campaign_lead.current_node_id already exists — skipped.")

    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())