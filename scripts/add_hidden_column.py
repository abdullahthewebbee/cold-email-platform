"""Add hidden column to gmail_thread and office365_thread tables."""
import asyncio
from app.database import AsyncSessionLocal

async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(__import__('sqlalchemy').text(
            "ALTER TABLE gmail_thread ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await db.execute(__import__('sqlalchemy').text(
            "ALTER TABLE office365_thread ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await db.commit()
        print("✅ hidden column added to gmail_thread and office365_thread")

asyncio.run(main())