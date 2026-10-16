"""System-level transactional email (password resets, etc.) — sent from the
platform's own address, independent of any customer's connected inbox.

Reuses the generic SMTP sender built for customer inboxes, just with
different (system-owned) credentials from the environment.
"""
import os
import logging

log = logging.getLogger("quickly.system_mail")


def send_system_email(to_email: str, subject: str, body: str, is_html: bool = False) -> bool:
    """Send a transactional email from the system's own address.
    Returns True on success, False on failure (never raises)."""
    from app.smtp_sender import send_via_smtp
    from app.sender import SendFailure

    host = os.getenv("SYSTEM_SMTP_HOST", "")
    port_raw = os.getenv("SYSTEM_SMTP_PORT", "")
    username = os.getenv("SYSTEM_SMTP_USERNAME", "")
    password = os.getenv("SYSTEM_SMTP_PASSWORD", "")
    encryption = os.getenv("SYSTEM_SMTP_ENCRYPTION", "ssl")
    from_email = os.getenv("SYSTEM_FROM_EMAIL", username)

    if not host or not username or not password:
        log.warning("send_system_email: SYSTEM_SMTP_* not configured — cannot send to %s", to_email)
        return False

    try:
        port = int(port_raw) if port_raw else None
    except ValueError:
        port = None

    result = send_via_smtp(
        to_email=to_email,
        subject=subject,
        body=body,
        from_email=from_email,
        from_name="Emissary",
        is_html=is_html,
        smtp_host=host,
        smtp_port=port,
        smtp_username=username,
        smtp_password=password,
        smtp_encryption=encryption,
    )

    if isinstance(result, SendFailure) or result is None:
        log.error("send_system_email: failed to send to %s: %s", to_email, result)
        return False

    log.info("send_system_email: sent to %s (subject=%r)", to_email, subject)
    return True