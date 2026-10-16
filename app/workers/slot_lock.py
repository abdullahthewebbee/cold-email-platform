"""Redis-backed distributed slot lock for run_slot_scan_job.

Replaces the in-process _pending_slot_ids set, which only prevents duplicate
dispatch within a single process. This lock works across multiple worker
replicas and API processes.

Usage:
    async with get_redis_pool() as pool:
        if await try_lock_slot(pool, slot_id, ttl=90):
            # we own this slot — dispatch it
        else:
            # another process already claimed it — skip

The TTL (90 seconds) is deliberately longer than the 60-second scan window
so that two consecutive scan ticks can't both claim the same slot. It is
shorter than any realistic send delay so locks don't accumulate indefinitely.
"""
from __future__ import annotations

import logging

log = logging.getLogger("quickly.workers.slot_lock")

SLOT_LOCK_PREFIX = "slot:lock:"
SLOT_LOCK_TTL = 90  # seconds


def _slot_key(slot_id: int) -> str:
    return f"{SLOT_LOCK_PREFIX}{slot_id}"


async def try_lock_slot(redis, slot_id: int, ttl: int = SLOT_LOCK_TTL) -> bool:
    """Try to acquire a distributed lock for *slot_id*.

    Returns True if the lock was acquired (this process owns the slot),
    False if another process already holds it.

    Uses Redis SET NX EX — atomic, no race condition possible.
    """
    key = _slot_key(slot_id)
    result = await redis.set(key, "1", nx=True, ex=ttl)
    acquired = result is not None
    if not acquired:
        log.debug("slot_lock: slot %d already locked — skipping", slot_id)
    return acquired


async def release_slot_lock(redis, slot_id: int) -> None:
    """Release the lock for *slot_id* early (e.g. after send completes).

    This is optional — the TTL will clean it up automatically. Only call
    this if you want to allow immediate retry on failure.
    """
    key = _slot_key(slot_id)
    await redis.delete(key)