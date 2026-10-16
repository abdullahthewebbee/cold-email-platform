"""arq WorkerSettings — defines which tasks the worker runs and the cron schedule.

Run the worker with:
    python -m arq app.workers.worker_settings.WorkerSettings

The worker process is completely separate from the FastAPI process, so it
can scale independently and won't block HTTP request handling.
"""
from __future__ import annotations

from arq.connections import RedisSettings
from arq.cron import cron

from app.workers.tasks import campaign_health_watchdog, tree_transition, send_slot
from app.workers.redis_settings import get_redis_settings


class WorkerSettings:
    """arq worker configuration class.

    functions: tasks that can be enqueued on demand (e.g. via enqueue_job())
    cron_jobs: tasks that run on a fixed schedule (like APScheduler interval jobs)
    redis_settings: connection to Redis/Memurai
    max_jobs: max concurrent tasks (keep low — these are I/O-heavy DB tasks)
    job_timeout: seconds before a running task is considered hung and cancelled
    keep_result: seconds to keep job results in Redis (for debugging)
    """
    functions = [
        campaign_health_watchdog,
        tree_transition,
        send_slot,
    ]

    cron_jobs = [
        cron(
            campaign_health_watchdog,
            hour={0, 6, 12, 18},
            minute=0,
            second=0,
            unique=True,
        ),
        cron(
            tree_transition,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},  # every 5 minutes
            second=0,
            unique=True,
        ),
    ]

    redis_settings: RedisSettings = get_redis_settings()
    max_jobs: int = 4
    job_timeout: int = 300  # 5 minutes max per task
    keep_result: int = 3600  # keep results in Redis for 1 hour
    queue_name: str = "arq:queue"