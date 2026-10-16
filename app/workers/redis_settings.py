"""Redis connection settings for arq workers.

Reads from environment variables so local dev (Memurai) and production
(Docker Redis service) use the same code path:

    REDIS_HOST  — default 127.0.0.1  (use 127.0.0.1, not localhost, on Windows)
    REDIS_PORT  — default 6379
    REDIS_PASSWORD — default None (Memurai dev has no password)

In docker-compose.yml, set REDIS_HOST=redis (the service name).
"""
from __future__ import annotations

import os
from arq.connections import RedisSettings


def get_redis_settings() -> RedisSettings:
    """Return arq RedisSettings from environment variables."""
    return RedisSettings(
        host=os.getenv("REDIS_HOST", "127.0.0.1"),
        port=int(os.getenv("REDIS_PORT", "6379")),
        password=os.getenv("REDIS_PASSWORD") or None,
    )