"""Pure parsing helpers for Unibox (Gmail/O365 message handling).

Extracted from app/unibox.py (Phase 5 module split). These functions have no
DB access, no I/O and no mutable state, so they are safe to import anywhere and
easy to unit-test in isolation. app.unibox re-exports them so all existing
imports (e.g. ``from app.unibox import _header_value``) keep working.
"""
from __future__ import annotations

import base64
import html as _html_lib
import json
import re
from datetime import datetime
from typing import Any


def _parse_headers(headers_json: str) -> list[dict[str, str]]:
    try:
        data = json.loads(headers_json or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, str]] = []
    for item in data:
        if isinstance(item, dict):
            out.append(
                {
                    "name": str(item.get("name", "")),
                    "value": str(item.get("value", "")),
                }
            )
    return out


def _header_value(headers_json: str, name: str) -> str:
    lname = name.lower()
    for hdr in _parse_headers(headers_json):
        if hdr["name"].lower() == lname:
            return hdr["value"]
    return ""


def _extract_email_only(header_value: str) -> str:
    """Extract bare email address from a From/To header value.

    Handles both ``Name <email>`` and bare ``email`` formats.
    Returns lowercase email or empty string if nothing found.
    """
    import re as _re
    angle_match = _re.search(r"<([^>]+)>", header_value)
    if angle_match:
        return angle_match.group(1).strip().lower()
    bare_match = _re.search(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", header_value, _re.IGNORECASE)
    if bare_match:
        return bare_match.group(0).strip().lower()
    return ""


def _parse_labels(label_ids_json: str) -> list[str]:
    try:
        labels = json.loads(label_ids_json or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(labels, list):
        return []
    return [str(x) for x in labels]


def _decode_base64url(data: str) -> bytes:
    padded = data + ("=" * ((4 - (len(data) % 4)) % 4))
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def _decode_gmail_body(data: str) -> str:
    try:
        return _decode_base64url(data).decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_bodies(payload: dict[str, Any]) -> tuple[str, str]:
    plain_parts: list[str] = []
    html_parts: list[str] = []

    def walk(part: dict[str, Any]) -> None:
        mime_type = str(part.get("mimeType", ""))
        body = part.get("body", {}) or {}
        data = body.get("data")
        if isinstance(data, str) and data:
            decoded = _decode_gmail_body(data)
            if mime_type == "text/plain":
                plain_parts.append(decoded)
            elif mime_type == "text/html":
                html_parts.append(decoded)
            elif not mime_type and decoded:
                plain_parts.append(decoded)

        for child in part.get("parts", []) or []:
            if isinstance(child, dict):
                walk(child)

    if isinstance(payload, dict):
        walk(payload)

    return ("\n".join(plain_parts).strip(), "\n".join(html_parts).strip())


def _epoch_ms_to_dt(ms: int | None) -> datetime | None:
    if ms is None:
        return None
    try:
        return datetime.utcfromtimestamp(ms / 1000.0)
    except Exception:
        return None


def _dt_to_iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    return dt.isoformat() + "Z"


# Matches common quoted-reply markers so we can strip them from snippets.
_QUOTE_START_RE = re.compile(
    r"(^|\n)[ \t]*>"  # lines starting with >
    r"|(^|\n)-{3,}"  # separator lines like ---
    r"|\bOn .{10,120}wrote:",  # "On <date> <person> wrote:"
    re.IGNORECASE | re.DOTALL,
)


# ── NDR / bounce-detection patterns ──────────────────────────────────────────
# Senders that indicate an automated delivery failure notification.
_MAILER_DAEMON_RE = re.compile(r"^(mailer-daemon|postmaster)@", re.IGNORECASE)


# Subjects that strongly suggest an NDR.
_BOUNCE_SUBJECT_RE = re.compile(
    r"(delivery.*(failed|failure|status|notification|problem)"
    r"|undeliverable"
    r"|mail.*not.*deliver"
    r"|returned.*mail"
    r"|failure.*notice)",
    re.IGNORECASE,
)


# DSN standard: Final-Recipient / Original-Recipient / X-Failed-Recipients
_FINAL_RECIPIENT_RE = re.compile(
    r"(?:Final-Recipient|Original-Recipient)\s*:\s*(?:rfc822\s*;\s*)?([^\s;,\r\n]+)",
    re.IGNORECASE,
)


_X_FAILED_RE = re.compile(r"X-Failed-Recipients\s*:\s*([^\r\n,]+)", re.IGNORECASE)


# Generic email-address pattern (used as fallback near 5xx codes).
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


# Permanent SMTP error (5xx).
_SMTP_5XX_RE = re.compile(r"\b5[0-9]{2}\b|\b5\.[0-9]\.[0-9]\b")


def _extract_bounced_recipient(body_plain: str, body_html: str, snippet: str = "") -> str | None:
    """Try to extract the original recipient address from an NDR/bounce email.

    Tries, in order:
    1. DSN standard headers (Final-Recipient / Original-Recipient)
    2. X-Failed-Recipients header
    3. Email addresses found on lines containing a 5xx SMTP error code
    Returns the address in lower-case, or *None* if nothing is found.
    """
    text = body_plain or _strip_html_tags(body_html) or snippet

    # 1. DSN standard
    m = _FINAL_RECIPIENT_RE.search(text)
    if m:
        addr = m.group(1).strip().lower().strip("<>")
        if "@" in addr:
            return addr

    # 2. X-Failed-Recipients
    m = _X_FAILED_RE.search(text)
    if m:
        addr = m.group(1).strip().lower()
        if "@" in addr:
            return addr

    # 3. Email address near a 5xx error line
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if _SMTP_5XX_RE.search(line):
            window = "\n".join(lines[max(0, i - 2) : i + 3])
            for candidate in _EMAIL_RE.findall(window):
                cl = candidate.lower()
                if not _MAILER_DAEMON_RE.match(cl):
                    return cl

    return None


_HTML_TAG_RE = re.compile(r"<[^>]+>")


# Hidden preheader divs should not contribute to visible snippets.
_PREHEADER_RE = re.compile(
    r"<div[^>]*style=[^>]*display\s*:\s*none[^>]*>.*?</div>",
    re.IGNORECASE | re.DOTALL,
)


def _strip_html_tags(text: str) -> str:
    """Strip HTML tags and decode entities to get plain text."""
    no_preheader = _PREHEADER_RE.sub("", text)
    no_tags = _HTML_TAG_RE.sub(" ", no_preheader)
    return _html_lib.unescape(no_tags)


def _strip_quoted(text: str) -> str:
    """Return text with quoted/reply sections removed."""
    m = _QUOTE_START_RE.search(text)
    if m:
        return text[: m.start()].rstrip()
    return text


def _body_snippet(plain: str, html: str, fallback: str = "") -> str:
    if plain:
        base = plain
    elif html:
        base = _strip_html_tags(html)
    else:
        base = _strip_html_tags(fallback) if "<" in fallback else fallback
    base = _strip_quoted(base)
    compact = " ".join(base.split())
    return compact[:180]
