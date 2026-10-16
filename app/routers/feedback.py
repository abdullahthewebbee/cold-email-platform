"""In-app bug reports & feature/integration requests — emailed to the team."""
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth import get_current_user

log = logging.getLogger("quickly.feedback")
router = APIRouter(prefix="/api/feedback", tags=["feedback"])

FEEDBACK_INBOX = "noreply@devlet.tech"


class FeedbackRequest(BaseModel):
    kind: str  # "bug" | "feature"
    message: str
    meta: dict = {}


@router.post("")
async def submit_feedback(data: FeedbackRequest, user=Depends(get_current_user)):
    from app.system_mail import send_system_email

    subject_prefix = "[Bug Report]" if data.kind == "bug" else "[Feature Request]"
    meta_lines = "\n".join(f"- {k}: {v}" for k, v in data.meta.items())
    body = (
        f"From: {user.username} ({user.email})\n"
        f"Org ID: {user.org_id}\n\n"
        f"{data.message}\n\n"
        f"---\n{meta_lines}"
    )
    sent = send_system_email(
        to_email=FEEDBACK_INBOX,
        subject=f"{subject_prefix} from {user.username}",
        body=body,
    )
    if not sent:
        log.error("submit_feedback: failed to send %s from user=%s", data.kind, user.id)
        return {"ok": False, "detail": "Could not send right now. Please try again shortly."}
    log.info("submit_feedback: %s sent from user=%s", data.kind, user.id)
    return {"ok": True, "detail": "Thanks — we received it and will follow up if needed."}