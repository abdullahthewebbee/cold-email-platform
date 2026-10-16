"""Redis-backed cache for hot, frequently-polled queries.

Design rules (learned from the rate-limiter work in Phase 4):
- Degrades gracefully: if Redis is unavailable or REDIS_HOST is unset, every
  function becomes a no-op and callers fall through to the database. The app
  must never break because the cache is down.
- Short TTLs only. This cache exists to absorb polling traffic (the frontend
  hits /notifications/unread-count every ~15s), not to be a source of truth.
- Always namespace keys by org/user so one tenant can never read another's
  cached value.

Usage:
    from app.cache import cache_get_json, cache_set_json, cache_invalidate

    cached = await cache_get_json(f"unread:{user.id}")
    if cached is not None:
        return cached
    value = await expensive_query()
    await cache_set_json(f"unread:{user.id}", value, ttl=10)
    return value
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

log = logging.getLogger("quickly.cache")

_KEY_PREFIX = "cache:"
_pool = None
_disabled = False


async def _get_redis():
    """Lazily create a Redis connection. Returns None when caching is unavailable."""
    global _pool, _disabled
    if _disabled:
        return None
    if _pool is not None:
        return _pool
    host = os.getenv("REDIS_HOST")
    if not host:
        # No Redis configured (e.g. local dev, tests) — caching silently off.
        _disabled = True
        return None
    try:
        import redis.asyncio as aioredis
        _pool = aioredis.Redis(
            host=host,
            port=int(os.getenv("REDIS_PORT", "6379")),
            password=os.getenv("REDIS_PASSWORD") or None,
            db=int(os.getenv("REDIS_CACHE_DB", "2")),  # db 2 — separate from arq (0) and rate limits (1)
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        log.info("cache: using Redis at %s:%s db=%s", host, os.getenv("REDIS_PORT", "6379"),
                 os.getenv("REDIS_CACHE_DB", "2"))
        return _pool
    except Exception as exc:
        log.warning("cache: Redis unavailable, caching disabled: %s", exc)
        _disabled = True
        return None


async def cache_get_json(key: str) -> Any | None:
    """Return the cached value for *key*, or None on miss/error."""
    r = await _get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(_KEY_PREFIX + key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        log.debug("cache: get failed for %s: %s", key, exc)
        return None


async def cache_set_json(key: str, value: Any, ttl: int = 15) -> None:
    """Cache *value* under *key* for *ttl* seconds. Never raises."""
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.set(_KEY_PREFIX + key, json.dumps(value), ex=ttl)
    except Exception as exc:
        log.debug("cache: set failed for %s: %s", key, exc)


async def cache_invalidate(key: str) -> None:
    """Drop a cached key immediately (call after a write that changes it)."""
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.delete(_KEY_PREFIX + key)
    except Exception as exc:
        log.debug("cache: invalidate failed for %s: %s", key, exc)