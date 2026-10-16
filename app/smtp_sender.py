"""Generic SMTP email sending (for Hostinger, GoDaddy, cPanel, and other
non-OAuth business email providers)."""
from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid, formataddr
from typing import Optional

log = logging.getLogger("quickly.smtp_sender")


def _build_message(
    to_email: str,
    subject: str,
    body: str,
    from_email: str,
    from_name: str = "",
    reply_to_msg_id: Optional[str] = None,
    references: Optional[str] = None,
    is_html: bool = False,
    list_unsubscribe_url: Optional[str] = None,
) -> tuple[EmailMessage, str]:
    msg = EmailMessage()
    msg["Subject"] = subject or ""
    msg["From"] = formataddr((from_name, from_email)) if from_name else from_email
    msg["To"] = to_email

    domain = from_email.split("@")[-1] if "@" in from_email else None
    msg_id = make_msgid(domain=domain)
    msg["Message-ID"] = msg_id

    if reply_to_msg_id:
        msg["In-Reply-To"] = reply_to_msg_id
    if references:
        msg["References"] = references
    if list_unsubscribe_url:
        msg["List-Unsubscribe"] = f"<{list_unsubscribe_url}>"
        msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    if is_html:
        msg.set_content("This email requires an HTML-capable client.")
        msg.add_alternative(body or "", subtype="html")
    else:
        msg.set_content(body or "")

    return msg, msg_id


def send_via_smtp(
    to_email: str,
    subject: str,
    body: str,
    from_email: str,
    from_name: str = "",
    reply_to_msg_id: Optional[str] = None,
    references: Optional[str] = None,
    is_html: bool = False,
    smtp_host: str = "",
    smtp_port: Optional[int] = None,
    smtp_username: str = "",
    smtp_password: str = "",
    smtp_encryption: str = "starttls",
    list_unsubscribe_url: Optional[str] = None,
):
    """Send one email via a generic SMTP server.

    Returns SendResult on success, SendFailure on a permanent error
    (bad auth / rejected recipient — do not retry), or None on a
    transient error (safe to retry later). Mirrors the Gmail/Office365
    sender contract in app.sender.
    """
    # Deferred import to avoid a circular import with app.sender.
    from app.sender import SendResult, SendFailure

    if not smtp_host or not smtp_username or not smtp_password:
        return SendFailure(error_type="auth_failed", message="SMTP credentials not configured for this inbox")

    msg, msg_id = _build_message(
        to_email, subject, body, from_email, from_name,
        reply_to_msg_id, references, is_html, list_unsubscribe_url,
    )

    encryption = (smtp_encryption or "starttls").lower()
    port = smtp_port or (465 if encryption == "ssl" else 587)

    try:
        if encryption == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, port, context=context, timeout=30) as server:
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, port, timeout=30) as server:
                server.ehlo()
                if encryption != "none":
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                server.login(smtp_username, smtp_password)
                server.send_message(msg)
    except smtplib.SMTPAuthenticationError as e:
        log.error("SMTP auth failed for %s@%s: %s", smtp_username, smtp_host, e)
        return SendFailure(error_type="auth_failed", message=f"SMTP authentication failed: {e}")
    except smtplib.SMTPRecipientsRefused as e:
        # e.recipients maps {email: (smtp_code, message_bytes)} — extract the real
        # SMTP response so we can classify the bounce instead of discarding it.
        from app.bounce_classifier import classify_bounce
        code = None
        detail = str(e)
        try:
            first = next(iter(e.recipients.values()))
            code, raw_msg = first
            msg_text = raw_msg.decode(errors="replace") if isinstance(raw_msg, bytes) else str(raw_msg)
            detail = f"{code} {msg_text}"
        except Exception:
            pass
        bounce_type = classify_bounce(detail, smtp_code=code)
        log.warning("SMTP recipient refused for %s: %s (bounce_type=%s)", to_email, detail, bounce_type)
        return SendFailure(error_type="invalid_recipient", message=detail, bounce_type=bounce_type)
    except smtplib.SMTPResponseException as e:
        # Rejection AFTER RCPT TO succeeded (e.g. content/spam-filtered at the DATA
        # stage). This is a PERMANENT failure — previously it fell through to the
        # generic handler below and was silently retried forever, which was a bug.
        from app.bounce_classifier import classify_bounce
        code = getattr(e, "smtp_code", None)
        raw_msg = getattr(e, "smtp_error", b"")
        msg_text = raw_msg.decode(errors="replace") if isinstance(raw_msg, bytes) else str(raw_msg)
        detail = f"{code} {msg_text}".strip() if code else str(e)
        bounce_type = classify_bounce(detail, smtp_code=code)
        log.warning("SMTP message rejected for %s: %s (bounce_type=%s)", to_email, detail, bounce_type)
        return SendFailure(error_type="bounce", message=detail, bounce_type=bounce_type)
    except (smtplib.SMTPException, OSError, TimeoutError) as e:
        log.warning("SMTP transient error sending to %s via %s: %s", to_email, smtp_host, e)
        return None
    except Exception:
        log.exception("Unexpected SMTP send error (to=%s host=%s)", to_email, smtp_host)
        return None

    return SendResult(message_id=msg_id, thread_id=None)


def test_smtp_login(
    host: str,
    port: int,
    username: str,
    password: str,
    encryption: str = "starttls",
) -> tuple[bool, Optional[str]]:
    """Try logging in to an SMTP server without sending anything.
    Returns (True, None) on success, or (False, error_message) on failure.
    Used by the 'test connection' button before an inbox is saved.
    """
    encryption = (encryption or "starttls").lower()
    try:
        if encryption == "ssl":
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
                server.login(username, password)
        else:
            with smtplib.SMTP(host, port, timeout=15) as server:
                server.ehlo()
                if encryption != "none":
                    server.starttls(context=ssl.create_default_context())
                    server.ehlo()
                server.login(username, password)
        return True, None
    except smtplib.SMTPAuthenticationError as e:
        return False, f"Authentication failed: {e}"
    except Exception as e:
        return False, str(e)