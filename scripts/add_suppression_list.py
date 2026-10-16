"""Migration: add suppression_entry table (global do-not-contact list)."""
import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import AsyncSessionLocal, engine
from app.models import Base, SuppressionEntry


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(sync_conn, tables=[SuppressionEntry.__table__])
        )
    print("Created suppression_entry table (or already existed).")


if __name__ == "__main__":
    asyncio.run(main())