"""
Seed script — sets DeepSeek V3 Flash as the provider/model for all 4 AI features.

Run from D:\\projects\\quickly:
    uv run python seed_deepseek.py
"""
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

async def main():
    from app.database import AsyncSessionLocal
    from app.models import AppSetting
    from sqlalchemy import select

    FEATURES = [
        "reply_classifier",
        "reply_draft_assistant",
        "deep_personalization",
        "sequence_generator",
    ]

    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    if not DEEPSEEK_API_KEY:
        print("ERROR: DEEPSEEK_API_KEY not found in .env")
        return

    async with AsyncSessionLocal() as db:
        for feature in FEATURES:
            settings_to_set = {
                f"ai_{feature}_provider":           "deepseek",
                f"ai_{feature}_model":              "deepseek-chat",
                f"ai_{feature}_api_key":            DEEPSEEK_API_KEY,
                f"ai_{feature}_enabled":            "true",
                f"ai_{feature}_connection_tested":  "true",
            }

            for key, value in settings_to_set.items():
                result = await db.execute(
                    select(AppSetting).where(AppSetting.key == key)
                )
                row = result.scalar_one_or_none()
                if row:
                    row.value = value
                    print(f"  updated: {key}")
                else:
                    db.add(AppSetting(key=key, value=value))
                    print(f"  inserted: {key}")

        await db.commit()
        print(f"\n✅ DeepSeek V3 Flash seeded for {len(FEATURES)} features.")
        print("   Restart uvicorn to pick up changes.")

asyncio.run(main())
