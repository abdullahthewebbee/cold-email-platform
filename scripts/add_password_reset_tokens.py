"""Migration: add password_reset_token table (forgot-password flow)."""
import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database import engine
from app.models import Base, PasswordResetToken


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: Base.metadata.create_all(sync_conn, tables=[PasswordResetToken.__table__])
        )
    print("Created password_reset_token table (or already existed).")


if __name__ == "__main__":
    asyncio.run(main())