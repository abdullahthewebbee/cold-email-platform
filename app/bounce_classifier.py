"""Classifies a permanent send failure into a bounce category:
hard, soft, block, or content.

- hard: the recipient address does not exist
- soft: a temporary failure (mailbox full, greylisting, temporary server issue)
- block: the sender/IP was blocked by the recipient's mail system
  (reputation, rate limiting, blacklist)
- content: the message was rejected because of its content (spam filtering)

Classification uses the raw SMTP response code when we have one (our own
SMTP sending path), and falls back to keyword matching on the error message
otherwise (Gmail/Office365 API responses don't expose a raw SMTP code).
"""
from __future__ import annotations

_CONTENT_KEYWORDS = (
    "spam", "content rejected", "message content", "blocked message",
    "spamassassin", "bulk email", "spam score", "content filter",
)
_BLOCK_KEYWORDS = (
    "blacklist", "block list", "blocked", "reputation", "rate limit",
    "too many", "throttl", "denied due to policy", "ip address",
)
_SOFT_KEYWORDS = (
    "mailbox full", "quota exceeded", "over quota", "try again later",
    "temporarily", "greylist", "deferred", "insufficient",
)
_HARD_KEYWORDS = (
    "user unknown", "no such user", "does not exist", "mailbox unavailable",
    "recipient rejected", "invalid recipient", "address not found",
    "no mailbox", "unknown user", "user not found",
)


def classify_bounce(message: str, smtp_code: int | None = None) -> str:
    """Return 'hard', 'soft', 'block', or 'content' for a permanent send failure."""
    text = (message or "").lower()

    # A raw SMTP 4xx code is an unambiguous temporary/soft signal.
    if smtp_code is not None and 400 <= smtp_code < 500:
        return "soft"

    if any(k in text for k in _CONTENT_KEYWORDS):
        return "content"
    if any(k in text for k in _BLOCK_KEYWORDS):
        return "block"
    if any(k in text for k in _SOFT_KEYWORDS):
        return "soft"
    if any(k in text for k in _HARD_KEYWORDS):
        return "hard"

    # Safest default for an otherwise-unrecognized permanent failure.
    return "hard"