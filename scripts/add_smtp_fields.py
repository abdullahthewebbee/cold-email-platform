"""Migration: add SMTP fields to inbox table."""
import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.database import AsyncSessionLocal

NEW_COLUMNS = {
    "smtp_host": "VARCHAR(255)",
    "smtp_port": "INTEGER",
    "smtp_username": "VARCHAR(255)",
    "smtp_password": "TEXT",
    "smtp_encryption": "VARCHAR(16)",
}


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(text("PRAGMA table_info(inbox)"))
        existing = {row[1] for row in result.fetchall()}  # row[1] = column name

        for col, coltype in NEW_COLUMNS.items():
            if col in existing:
                print(f"Skipping {col} (already exists)")
                continue
            await db.execute(text(f"ALTER TABLE inbox ADD COLUMN {col} {coltype}"))
            print(f"Added column: {col}")

        await db.commit()
        print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())