"""Shared rate limiter + a lightweight per-account login lockout.

IMPORTANT: this uses in-memory storage. That is correct and sufficient for
a single-instance deployment (this app's current Docker Compose setup — one
`app` container). If this is ever scaled to run multiple app instances behind
a load balancer, swap slowapi's storage_uri to Redis and move
_failed_login_attempts into Redis too, or logins from different instances
will not share lockout state.
"""
from __future__ import annotations

import logging
import time

from fastapi import Request
from slowapi import Limiter

from app.client_ip import client_ip_from_request

log = logging.getLogger("quickly.rate_limit")


def _get_real_ip(request: Request) -> str:
    """Rate-limit key: client IP via common proxy/CDN headers, else the socket."""
    return client_ip_from_request(request) or "unknown"


def _redis_storage_uri() -> str | None:
    """Use Redis for rate-limit storage when REDIS_HOST is configured, so limits
    are shared across app replicas. Falls back to in-memory (single instance)."""
    import os
    host = os.getenv("REDIS_HOST")
    if not host:
        return None
    port = os.getenv("REDIS_PORT", "6379")
    password = os.getenv("REDIS_PASSWORD")
    auth = f":{password}@" if password else ""
    return f"redis://{auth}{host}:{port}/1"  # db 1 — keep separate from arq's db 0


_storage = _redis_storage_uri()
limiter = Limiter(
    key_func=_get_real_ip,
    default_limits=["200/minute"],
    storage_uri=_storage or "memory://",
)
if _storage:
    log.info("rate_limit: using Redis storage at %s", _storage.split("@")[-1])
else:
    log.info("rate_limit: using in-memory storage (set REDIS_HOST to share limits across replicas)")


# ---------------------------------------------------------------------------
# Per-account login lockout (defends against credential stuffing from many
# IPs targeting one account — the IP-based limiter alone can't catch this).
# ---------------------------------------------------------------------------
_FAILED_LOGIN_WINDOW_SECONDS = 15 * 60  # 15 minutes
_FAILED_LOGIN_MAX_ATTEMPTS = 5
_failed_login_attempts: dict[str, list[float]] = {}


def check_account_lockout(username: str) -> None:
    """Raise if this account has too many recent failed login attempts."""
    from fastapi import HTTPException

    key = username.strip().lower()
    now = time.time()
    attempts = [t for t in _failed_login_attempts.get(key, []) if now - t < _FAILED_LOGIN_WINDOW_SECONDS]
    _failed_login_attempts[key] = attempts
    if len(attempts) >= _FAILED_LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many failed login attempts for this account. Try again in 15 minutes.")


def record_failed_login(username: str) -> None:
    key = username.strip().lower()
    _failed_login_attempts.setdefault(key, []).append(time.time())


def clear_failed_logins(username: str) -> None:
    _failed_login_attempts.pop(username.strip().lower(), None)