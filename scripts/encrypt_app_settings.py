"""Migration: encrypt existing plaintext values in the app_setting table.

Safe to run multiple times — already-encrypted rows are skipped.
Run once against your database:
    python scripts/encrypt_app_settings.py
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from app.database import AsyncSessionLocal
from app.security import encrypt, is_encrypted


async def main():
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text("SELECT key, value FROM app_setting"))).fetchall()
        updated = 0
        skipped = 0
        for key, value in rows:
            if value and not is_encrypted(value):
                await db.execute(
                    text("UPDATE app_setting SET value = :v WHERE key = :k"),
                    {"v": encrypt(value), "k": key},
                )
                updated += 1
            else:
                skipped += 1
        await db.commit()
        print(f"Migration complete: encrypted {updated} row(s), skipped {skipped} (already encrypted or empty).")


if __name__ == "__main__":
    asyncio.run(main())