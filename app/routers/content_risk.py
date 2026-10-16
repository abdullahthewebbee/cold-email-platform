"""Spam Score Pre-Check: on-demand content risk scoring for the email editor.
Thin HTTP wrapper around app.content_risk.score_content — see that module
for the actual rule-based scoring logic (shared with Send Autopsy)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.content_risk import score_content

router = APIRouter(prefix="/api/content-risk", tags=["content-risk"])


class ContentRiskCheckRequest(BaseModel):
    subject: str = ""
    body: str = ""


@router.post("/check")
async def check_content_risk(data: ContentRiskCheckRequest):
    """Score email content for spam-trigger risk. Called live from the editor
    as the user types (debounced client-side)."""
    return score_content(data.subject, data.body)