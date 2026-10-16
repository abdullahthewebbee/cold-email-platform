"""Migration: add queue_slot.node_id and campaign_lead.node_ready_at
for tree-based (branch) sequence scheduling. Additive only."""
import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.database import AsyncSessionLocal


async def _add_column_if_missing(db, table: str, column: str, coltype: str):
    result = await db.execute(text(f"PRAGMA table_info({table})"))
    existing = {row[1] for row in result.fetchall()}
    if column in existing:
        print(f"{table}.{column} already exists — skipped.")
        return
    await db.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
    print(f"Added {table}.{column}")


async def main():
    async with AsyncSessionLocal() as db:
        await _add_column_if_missing(db, "queue_slot", "node_id", "INTEGER")
        await _add_column_if_missing(db, "campaign_lead", "node_ready_at", "DATETIME")
        await db.commit()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())