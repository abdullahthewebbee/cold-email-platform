from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException
from datetime import datetime
from tests.conftest import make_campaign, make_sequence, make_lead, make_campaign_lead, make_inbox, make_email_log
from app.routers.campaigns import create_sequence
from app.routers.sequence_tree import _block_tree_edit_unless_manual


def _seq_data():
    return SimpleNamespace(
        position=1, subject="s", body="b", wait_days_after_previous=1,
        is_html=False, preview_text=None, fallback_subject=None,
        fallback_body=None, custom_id=None,
    )


@pytest.mark.asyncio
async def test_semi_manual_blocks_second_step(session):
    camp = await make_campaign(session)
    camp.campaign_mode = "semi_manual"
    await make_sequence(session, camp.id, position=0)
    await session.flush()
    with pytest.raises(HTTPException) as exc:
        await create_sequence(camp.id, _seq_data(), BackgroundTasks(), db=session, org_id=None)
    assert exc.value.status_code == 400
    assert "only Step 1" in exc.value.detail


@pytest.mark.asyncio
async def test_full_ai_blocks_any_step(session):
    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    await session.flush()
    with pytest.raises(HTTPException) as exc:
        await create_sequence(camp.id, _seq_data(), BackgroundTasks(), db=session, org_id=None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["semi_manual", "full_ai"])
async def test_tree_blocked_outside_manual(mode):
    with pytest.raises(HTTPException) as exc:
        await _block_tree_edit_unless_manual(SimpleNamespace(campaign_mode=mode))
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_tree_allowed_in_manual():
    await _block_tree_edit_unless_manual(SimpleNamespace(campaign_mode="manual"))
    
from app.routers.campaigns import create_campaign
from app.schemas import CampaignCreate
from app.models import Sequence
from sqlalchemy import select


@pytest.mark.asyncio
async def test_full_ai_campaign_gets_hidden_personalized_step(session):
    data = CampaignCreate(name="Full AI Test", inbox_ids=[], campaign_mode="full_ai")
    resp = await create_campaign(data, db=session, org_id=None, _gate=None)
    assert resp.campaign_mode == "full_ai"

    rows = (await session.execute(
        select(Sequence).where(Sequence.campaign_id == resp.id)
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].sequence_type == "personalized"
    assert rows[0].position == 0


@pytest.mark.asyncio
async def test_manual_campaign_gets_no_hidden_step(session):
    data = CampaignCreate(name="Manual Test", inbox_ids=[], campaign_mode="manual")
    resp = await create_campaign(data, db=session, org_id=None, _gate=None)

    rows = (await session.execute(
        select(Sequence).where(Sequence.campaign_id == resp.id)
    )).scalars().all()
    assert len(rows) == 0
    
from unittest.mock import AsyncMock
from app import jobs as jobs_mod
from app.models import FullAIDraft, CampaignLead, CustomEmailOverride


class _SessionCtx:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, exc_type, exc, tb):
        return None


@pytest.mark.asyncio
async def test_full_ai_job_drafts_new_leads(session, monkeypatch):
    monkeypatch.setattr(jobs_mod, "AsyncSessionLocal", lambda: _SessionCtx(session))
    monkeypatch.setattr(
        jobs_mod, "generate_personalized_email",
        AsyncMock(return_value={"subject": "Hi there", "body": "Some AI text"}),
        raising=False,
    )

    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    lead = await make_lead(session, email="draftme@example.com")
    cl = await make_campaign_lead(session, camp.id, lead.id)
    await session.flush()

    await jobs_mod.run_full_ai_job()

    rows = (await session.execute(
        select(FullAIDraft).where(FullAIDraft.campaign_lead_id == cl.id)
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].subject == "Hi there"
    assert rows[0].status == "pending"


@pytest.mark.asyncio
async def test_full_ai_job_skips_already_drafted_lead(session, monkeypatch):
    monkeypatch.setattr(jobs_mod, "AsyncSessionLocal", lambda: _SessionCtx(session))
    mock_gen = AsyncMock(return_value={"subject": "New", "body": "New body"})
    monkeypatch.setattr(jobs_mod, "generate_personalized_email", mock_gen, raising=False)

    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    lead = await make_lead(session, email="already@example.com")
    cl = await make_campaign_lead(session, camp.id, lead.id)
    session.add(FullAIDraft(campaign_lead_id=cl.id, subject="Old", body="Old body", status="pending"))
    await session.flush()

    await jobs_mod.run_full_ai_job()

    rows = (await session.execute(
        select(FullAIDraft).where(FullAIDraft.campaign_lead_id == cl.id)
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].subject == "Old"
    mock_gen.assert_not_called()


@pytest.mark.asyncio
async def test_full_ai_job_creates_no_draft_when_ai_returns_none(session, monkeypatch):
    monkeypatch.setattr(jobs_mod, "AsyncSessionLocal", lambda: _SessionCtx(session))
    monkeypatch.setattr(
        jobs_mod, "generate_personalized_email",
        AsyncMock(return_value=None), raising=False,
    )

    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    lead = await make_lead(session, email="nodraft@example.com")
    cl = await make_campaign_lead(session, camp.id, lead.id)
    await session.flush()

    await jobs_mod.run_full_ai_job()

    rows = (await session.execute(
        select(FullAIDraft).where(FullAIDraft.campaign_lead_id == cl.id)
    )).scalars().all()
    assert len(rows) == 0
    
from app.routers.full_ai_drafts import approve_full_ai_draft, reject_full_ai_draft
from app.models import FullAIDraft as FullAIDraftModel


@pytest.mark.asyncio
async def test_approve_draft_creates_override_and_activates_lead(session):
    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    await session.flush()
    seq = await make_sequence(session, camp.id, position=0, sequence_type="personalized")
    lead = await make_lead(session, email="approveme@example.com")
    cl = await make_campaign_lead(session, camp.id, lead.id)
    cl.enrollment_status = "needs_custom_email"
    draft = FullAIDraftModel(campaign_lead_id=cl.id, subject="AI Subject", body="AI Body", status="pending")
    session.add(draft)
    await session.flush()

    result = await approve_full_ai_draft(
        camp.id, draft.id, BackgroundTasks(), db=session, org_id=None
    )
    assert result["ok"] is True

    ov = (await session.execute(
        select(CustomEmailOverride).where(CustomEmailOverride.campaign_lead_id == cl.id)
    )).scalars().first()
    assert ov is not None
    assert ov.subject == "AI Subject"
    assert ov.body == "AI Body"

    await session.refresh(draft)
    assert draft.status == "approved"
    await session.refresh(cl)
    assert cl.enrollment_status == "active"


@pytest.mark.asyncio
async def test_approve_draft_twice_fails(session):
    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    await session.flush()
    await make_sequence(session, camp.id, position=0, sequence_type="personalized")
    lead = await make_lead(session, email="twice@example.com")
    cl = await make_campaign_lead(session, camp.id, lead.id)
    draft = FullAIDraftModel(campaign_lead_id=cl.id, subject="S", body="B", status="pending")
    session.add(draft)
    await session.flush()

    await approve_full_ai_draft(camp.id, draft.id, BackgroundTasks(), db=session, org_id=None)

    with pytest.raises(HTTPException) as exc:
        await approve_full_ai_draft(camp.id, draft.id, BackgroundTasks(), db=session, org_id=None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_reject_draft_leaves_no_override(session):
    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    await session.flush()
    await make_sequence(session, camp.id, position=0, sequence_type="personalized")
    lead = await make_lead(session, email="rejectme@example.com")
    cl = await make_campaign_lead(session, camp.id, lead.id)
    draft = FullAIDraftModel(campaign_lead_id=cl.id, subject="S", body="B", status="pending")
    session.add(draft)
    await session.flush()

    result = await reject_full_ai_draft(camp.id, draft.id, db=session, org_id=None)
    assert result["ok"] is True

    await session.refresh(draft)
    assert draft.status == "rejected"

    ov = (await session.execute(
        select(CustomEmailOverride).where(CustomEmailOverride.campaign_lead_id == cl.id)
    )).scalars().first()
    assert ov is None
    
from app.ai_classifier import reply_needs_human_review


def test_reply_needs_human_review_detects_keywords():
    assert reply_needs_human_review("I want a refund please") is True
    assert reply_needs_human_review("Please cancel my subscription") is True
    assert reply_needs_human_review("What's the pricing on this?") is True


def test_reply_needs_human_review_allows_normal_replies():
    assert reply_needs_human_review("Sure, sounds interesting, tell me more") is False
    assert reply_needs_human_review("Yes let's schedule a call") is False
    assert reply_needs_human_review("") is False
    assert reply_needs_human_review(None) is False
    
from app import jobs as jobs_mod
from app.models import Inbox, EmailLog


@pytest.mark.asyncio
async def test_send_reply_email_returns_none_with_no_prior_log(session):
    inbox = await make_inbox(session, provider="gmail")
    camp = await make_campaign(session)
    lead = await make_lead(session, email="noreply@example.com")

    result = await jobs_mod.send_reply_email(session, lead, camp, "Re: hi", "body text")
    assert result is None


@pytest.mark.asyncio
async def test_send_reply_email_simulated_send_succeeds_in_test_mode(session, monkeypatch):
    monkeypatch.setattr(jobs_mod.settings, "test_mode", True)

    inbox = await make_inbox(session, provider="gmail")
    camp = await make_campaign(session)
    lead = await make_lead(session, email="realreply@example.com")

    log_row = await make_email_log(session, lead.id, camp.id, inbox_id=inbox.id)
    log_row.message_id = "<orig-msg-id@test.com>"
    log_row.thread_id = "thread-abc"
    await session.flush()

    result = await jobs_mod.send_reply_email(session, lead, camp, "Re: hi", "AI reply body")
    assert result is not None
    assert type(result).__name__ == "SendResult"

    new_log_res = await session.execute(
        select(EmailLog).where(
            EmailLog.lead_id == lead.id,
            EmailLog.campaign_id == camp.id,
            EmailLog.id != log_row.id,
        )
    )
    new_log = new_log_res.scalar_one_or_none()
    assert new_log is not None
    assert new_log.message_id == result.message_id
    assert new_log.thread_id == result.thread_id


@pytest.mark.asyncio
async def test_send_reply_email_deletes_log_on_transient_failure(session, monkeypatch):
    monkeypatch.setattr(jobs_mod.settings, "test_mode", True)
    monkeypatch.setattr(jobs_mod, "send_email", lambda **kwargs: None)

    inbox = await make_inbox(session, provider="gmail")
    camp = await make_campaign(session)
    lead = await make_lead(session, email="failreply@example.com")

    log_row = await make_email_log(session, lead.id, camp.id, inbox_id=inbox.id)
    log_row.message_id = "<orig@test.com>"
    log_row.thread_id = "thread-fail"
    await session.flush()

    result = await jobs_mod.send_reply_email(session, lead, camp, "Re: hi", "AI reply body")
    assert result is None

    all_logs_res = await session.execute(
        select(EmailLog).where(EmailLog.lead_id == lead.id, EmailLog.campaign_id == camp.id)
    )
    remaining = all_logs_res.scalars().all()
    assert len(remaining) == 1
    assert remaining[0].id == log_row.id
    
    
@pytest.mark.asyncio
async def test_send_reply_email_clears_thread_id_on_cross_campaign_collision(session, monkeypatch):
    monkeypatch.setattr(jobs_mod.settings, "test_mode", True)

    inbox = await make_inbox(session, provider="gmail")
    camp_a = await make_campaign(session, name="Campaign A")
    camp_b = await make_campaign(session, name="Campaign B")
    lead = await make_lead(session, email="shared@example.com")

    log_a = await make_email_log(session, lead.id, camp_a.id, inbox_id=inbox.id)
    log_a.message_id = "<msg-a@test.com>"
    log_a.thread_id = "shared-thread-xyz"

    log_b = await make_email_log(session, lead.id, camp_b.id, inbox_id=inbox.id)
    log_b.message_id = "<msg-b@test.com>"
    log_b.thread_id = "shared-thread-xyz"
    await session.flush()

    result = await jobs_mod.send_reply_email(session, lead, camp_a, "Re: hi", "AI reply body")
    assert result is not None
    
from app.models import AppSetting, Notification, User


@pytest.mark.asyncio
async def test_auto_send_gate_blocks_when_disabled(session):
    camp = await make_campaign(session)
    session.add(AppSetting(key="full_ai_auto_send_enabled", value="false"))
    await session.flush()

    allowed, reason = await jobs_mod.check_full_ai_auto_send_allowed(session, "Yes I'm interested", camp.id)
    assert allowed is False
    assert "disabled" in reason


@pytest.mark.asyncio
async def test_auto_send_gate_blocks_ambiguous_keyword(session):
    camp = await make_campaign(session)
    session.add(AppSetting(key="full_ai_auto_send_enabled", value="true"))
    await session.flush()

    allowed, reason = await jobs_mod.check_full_ai_auto_send_allowed(session, "I want a refund", camp.id)
    assert allowed is False
    assert "human review" in reason


@pytest.mark.asyncio
async def test_auto_send_gate_blocks_over_daily_cap(session):
    camp = await make_campaign(session)
    from app.models import User
    user = User(username="owner1", email="owner1@example.com", is_owner=True)
    session.add(user)
    await session.flush()
    session.add(AppSetting(key="full_ai_auto_send_enabled", value="true"))
    session.add(AppSetting(key="full_ai_daily_reply_cap", value="1"))
    session.add(Notification(
        user_id=user.id, event_type="ai_reply_sent", title="x", message="x",
        campaign_id=camp.id, created_at=datetime.utcnow(),
    ))
    await session.flush()

    allowed, reason = await jobs_mod.check_full_ai_auto_send_allowed(session, "Sounds great", camp.id)
    assert allowed is False
    assert "cap" in reason


@pytest.mark.asyncio
async def test_auto_send_gate_allows_when_all_clear(session):
    camp = await make_campaign(session)
    session.add(AppSetting(key="full_ai_auto_send_enabled", value="true"))
    session.add(AppSetting(key="full_ai_daily_reply_cap", value="20"))
    await session.flush()

    allowed, reason = await jobs_mod.check_full_ai_auto_send_allowed(session, "Sounds great, let's talk", camp.id)
    assert allowed is True
    assert reason == ""
    
from app import ai_classifier as ai_mod
from app import unibox as unibox_mod


@pytest.mark.asyncio
async def test_full_ai_reply_auto_sends_when_all_clear(session, monkeypatch):
    monkeypatch.setattr(jobs_mod.settings, "test_mode", True)
    monkeypatch.setattr(unibox_mod, "AsyncSessionLocal", lambda: _SessionCtx(session))

    monkeypatch.setattr(ai_mod, "is_ai_enabled", AsyncMock(return_value=True))
    monkeypatch.setattr(ai_mod, "classify_reply", AsyncMock(return_value="interested"))
    monkeypatch.setattr(ai_mod, "draft_reply", AsyncMock(return_value="Thanks for your interest!"))

    inbox = await make_inbox(session, provider="gmail")
    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    lead = await make_lead(session, email="autosend@example.com", name="Auto Send")
    cl = await make_campaign_lead(session, camp.id, lead.id)

    log_row = await make_email_log(session, lead.id, camp.id, inbox_id=inbox.id)
    log_row.message_id = "<orig-msg@test.com>"
    log_row.thread_id = "thread-autosend"

    owner = User(username="fullaiowner", email="fullaiowner@example.com", is_owner=True, org_id=camp.org_id)
    session.add(owner)

    session.add(AppSetting(key="full_ai_auto_send_enabled", value="true"))
    session.add(AppSetting(key="full_ai_daily_reply_cap", value="20"))
    await session.flush()

    await unibox_mod._classify_and_notify_bg(
        lead_id=lead.id,
        lead_email=lead.email,
        lead_name=lead.name,
        campaign_ids=[camp.id],
        reply_text="Yes, I'm interested, tell me more",
        thread_id="thread-autosend",
    )

    notif_res = await session.execute(
        select(Notification).where(Notification.campaign_id == camp.id)
    )
    notif = notif_res.scalars().first()
    assert notif is not None
    assert notif.event_type == "ai_reply_sent"

    new_logs_res = await session.execute(
        select(EmailLog).where(EmailLog.lead_id == lead.id, EmailLog.campaign_id == camp.id)
    )
    all_logs = new_logs_res.scalars().all()
    assert len(all_logs) == 2


@pytest.mark.asyncio
async def test_full_ai_reply_falls_back_to_draft_when_auto_send_disabled(session, monkeypatch):
    monkeypatch.setattr(jobs_mod.settings, "test_mode", True)
    monkeypatch.setattr(unibox_mod, "AsyncSessionLocal", lambda: _SessionCtx(session))

    monkeypatch.setattr(ai_mod, "is_ai_enabled", AsyncMock(return_value=True))
    monkeypatch.setattr(ai_mod, "classify_reply", AsyncMock(return_value="interested"))
    monkeypatch.setattr(ai_mod, "draft_reply", AsyncMock(return_value="Thanks for your interest!"))

    inbox = await make_inbox(session, provider="gmail")
    camp = await make_campaign(session)
    camp.campaign_mode = "full_ai"
    lead = await make_lead(session, email="nosend@example.com", name="No Send")
    cl = await make_campaign_lead(session, camp.id, lead.id)

    log_row = await make_email_log(session, lead.id, camp.id, inbox_id=inbox.id)
    log_row.message_id = "<orig-msg2@test.com>"
    log_row.thread_id = "thread-nosend"

    owner = User(username="fullaiowner2", email="fullaiowner2@example.com", is_owner=True, org_id=camp.org_id)
    session.add(owner)

    session.add(AppSetting(key="full_ai_auto_send_enabled", value="false"))
    await session.flush()

    await unibox_mod._classify_and_notify_bg(
        lead_id=lead.id,
        lead_email=lead.email,
        lead_name=lead.name,
        campaign_ids=[camp.id],
        reply_text="Yes, I'm interested",
        thread_id="thread-nosend",
    )

    notif_res = await session.execute(
        select(Notification).where(Notification.campaign_id == camp.id)
    )
    notif = notif_res.scalars().first()
    assert notif is not None
    assert notif.event_type == "ai_reply_draft"

    logs_res = await session.execute(
        select(EmailLog).where(EmailLog.lead_id == lead.id, EmailLog.campaign_id == camp.id)
    )
    all_logs = logs_res.scalars().all()
    assert len(all_logs) == 1