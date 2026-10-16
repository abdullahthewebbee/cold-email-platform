"""arq task definitions.

Each async function here is an arq task — it receives a context dict (ctx)
as its first argument (arq requirement), then delegates to the actual
business logic in the existing app modules. This keeps the worker layer
thin and the business logic independently testable.

Adding a new task:
1. Define an async function here (first arg must be ctx: dict)
2. Add it to WorkerSettings.functions in settings.py
3. Enqueue it via arq.ArqRedis.enqueue_job() where needed, or add a
   cron entry in WorkerSettings.cron_jobs
"""
from __future__ import annotations

import logging

log = logging.getLogger("quickly.workers.tasks")


async def campaign_health_watchdog(ctx: dict) -> dict:
    """Periodic task: check health rules (bounce rate, open rate) for every
    active campaign and fire in-app notifications + webhooks when thresholds
    are crossed.

    This is a thin wrapper around the existing business logic in
    app.campaign_health_watchdog — it simply provides the arq ctx signature
    and logs the outcome.
    """
    from app.campaign_health_watchdog import run_campaign_health_watchdog_job
    log.info("campaign_health_watchdog: starting")
    await run_campaign_health_watchdog_job()
    log.info("campaign_health_watchdog: done")
    return {"status": "ok"}



async def tree_transition(ctx: dict) -> dict:
    """Periodic task: evaluate due branch-tree transitions (opened/clicked
    conditions) and schedule the next node's send for each matching lead.

    Thin wrapper around the existing business logic in app.jobs.run_tree_transition_job.
    """
    from app.jobs import run_tree_transition_job
    log.info("tree_transition: starting")
    await run_tree_transition_job()
    log.info("tree_transition: done")
    return {"status": "ok"}



async def send_slot(ctx: dict, slot_id: int) -> dict:
    """Send a single queue slot by its ID.

    Called by arq workers when run_slot_scan_job enqueues a slot.
    The Redis slot lock (already acquired by the scanner before enqueuing)
    ensures this slot is only processed once across all worker replicas.
    The lock is released after the send attempt regardless of outcome.
    """
    from app.jobs import send_slot_job
    from app.workers.slot_lock import release_slot_lock
    import logging
    log = logging.getLogger("quickly.workers.tasks")
    log.info("send_slot: processing slot_id=%d", slot_id)
    try:
        await send_slot_job(slot_id)
        return {"status": "ok", "slot_id": slot_id}
    except Exception as exc:
        log.exception("send_slot: slot_id=%d failed: %s", slot_id, exc)
        return {"status": "error", "slot_id": slot_id, "error": str(exc)}
    finally:
        redis = ctx.get("redis")
        if redis:
            await release_slot_lock(redis, slot_id)