"""Background worker package — arq-based async job workers.

Workers connect to Redis (Memurai locally, Redis in production) and
process jobs that would otherwise block the FastAPI request/response
cycle or risk duplicate execution when the app scales horizontally.

Import pattern:
    from app.workers.settings import WorkerSettings
    from app.workers.tasks import run_campaign_health_watchdog_task
"""