"""Background job: send due emails from the queue."""
# // BEACON SYNC: This file handles tracking logic that Beacon mirrors.
# // Any changes to tracking behavior, event types, metadata collected, or URL structure
# // must also be reflected in the Beacon service (/beacon or the separate Beacon repo).
# // If you are an AI agent, add a TODO at the end of your response listing what needs to be updated in Beacon.
import asyncio
import logging
import random
import re
import secrets
from datetime import datetime, date, time, timedelta
from email.utils import make_msgid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore[assignment,misc]

from app.settings_manager import settings
from app.ai_classifier import generate_personalized_email
from app.database import AsyncSessionLocal
from app.models import (
    QueueSlot,
    CampaignLead,
    Campaign,
    Sequence,
    SequenceVariant,
    SequenceNode,
    SequenceEdge,
    Lead,
    Inbox,
    EmailLog,
    LeadReply,
    GmailAccount,
    Office365Account,
    LeadUnsubscribeToken,
    GmailMessage,
    Office365Message,
    CustomEmailOverride,
    BounceEvent,
)
from app.sender import send_email, render_body, get_lead_data, SendResult, SendFailure, build_quote_html, build_quote_plain, _plain_to_quoted_html, _strip_html_tags
from app.webhooks import fire_webhook_event
from app.app_settings import get_google_oauth_credentials, get_office365_oauth_credentials
from app import time as time_provider
from app.queue_logic import _parse_time, compute_effective_daily_limit
from app.campaign_lead_status import campaign_lead_may_receive_sends

log = logging.getLogger(__name__)


async def _update_enrollment_after_send(session: AsyncSession, cl: CampaignLead, campaign: Campaign, sequence: Sequence) -> None:
    n_seq = (
        await session.execute(
            select(func.count(Sequence.id)).where(Sequence.campaign_id == campaign.id)
        )
    ).scalar() or 0
    if getattr(cl, "enrollment_status", None) == "active":
        cl.enrollment_status = "contacted"
    if n_seq > 0 and sequence.position >= n_seq - 1:
        cl.enrollment_status = "completed"

# Updated each time run_send_job finishes (for /api/status)
last_send_job_run: datetime | None = None
last_send_job_sent_count: int = 0




def _in_sending_window(now_utc: datetime, campaign: Campaign) -> bool:
    """Check if *now_utc* falls within the campaign's sending days and hours.

    The campaign's ``sending_hours_start`` / ``sending_hours_end`` are expressed
    in its configured timezone (e.g. Africa/Cairo).  We convert ``now_utc`` to
    that timezone before comparing so the gate-check is always correct regardless
    of which UTC offset the server runs at.
    """
    tz_name = getattr(campaign, "timezone", None)
    if ZoneInfo and tz_name:
        try:
            tz = ZoneInfo(tz_name)
            # now_utc is a naive datetime from time_provider.now() which
            # returns server-local time; in Docker that equals UTC.
            now_local = now_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).replace(tzinfo=None)
        except Exception:
            now_local = now_utc
    else:
        now_local = now_utc

    if campaign.sending_days is None or now_local.weekday() not in campaign.sending_days:
        return False
    start = _parse_time(campaign.sending_hours_start or "09:00")
    end = _parse_time(campaign.sending_hours_end or "17:00")
    return start <= now_local.time() <= end


async def resolve_inbox_send_credentials(session: AsyncSession, inbox: "Inbox") -> dict:
    """Resolve per-inbox Gmail/Office365 send credentials.

    Extracted from the duplicated logic in run_send_job and send_slot_job so
    a third caller (Full AI reply auto-send) can reuse it without a third
    copy. Does NOT fetch OAuth app-level credentials (client_id/secret) --
    callers already do that once per function, since it is not inbox-specific.

    Returns a dict with keys:
        gmail_token (str), ga (GmailAccount|None), o365_account (Office365Account|None),
        simulate_send (bool), ok (bool)

    ok=False means no usable account was found for this inbox and test_mode
    simulation does not apply either -- the caller should treat this as
    "cannot send from this inbox" and decide its own fallback (skip, retry,
    or fall back to a draft for human review).
    """
    gmail_token = ""
    ga = None
    o365_account = None
    simulate_send = False
    ok = True

    if inbox.provider == "office365":
        o365_res = await session.execute(
            select(Office365Account).where(Office365Account.inbox_id == inbox.id)
        )
        o365_account = o365_res.scalar_one_or_none()
        if not o365_account:
            log.warning(
                "resolve_inbox_send_credentials: Office 365 inbox %s (%s) has no Office365Account",
                inbox.id, inbox.email,
            )
            ok = False
    else:
        ga_result = await session.execute(
            select(GmailAccount).where(GmailAccount.inbox_id == inbox.id)
        )
        ga = ga_result.scalar_one_or_none()
        if ga:
            gmail_token = ga.access_token
        else:
            if settings.test_mode:
                log.info(
                    "resolve_inbox_send_credentials: test mode, Gmail inbox %s (%s) has no GmailAccount -- simulating send",
                    inbox.id, inbox.email,
                )
                simulate_send = True
            else:
                log.warning(
                    "resolve_inbox_send_credentials: Gmail inbox %s (%s) has no GmailAccount",
                    inbox.id, inbox.email,
                )
                ok = False

    return {
        "gmail_token": gmail_token,
        "ga": ga,
        "o365_account": o365_account,
        "simulate_send": simulate_send,
        "ok": ok,
    }


async def run_send_job():
    """Run once: send today's due emails. Slots are per inbox (QueueSlot.inbox_id)."""
    global last_send_job_run, last_send_job_sent_count
    # Use local time so we match queue_logic (slots are stored in local time) and sending window (09:00–17:00 is local)
    now = time_provider.now()
    log.info("Send job running at %s (local)", now.isoformat())

    async with AsyncSessionLocal() as session:
        today = now.date()

        result = await session.execute(select(Inbox).where(Inbox.paused == False))  # noqa: E712
        inboxes = result.scalars().all()

        total_sent = 0
        # Pre-fetch Google OAuth credentials once for all Gmail inboxes
        g_client_id, g_client_secret = await get_google_oauth_credentials(session)
        # Pre-fetch Office 365 OAuth credentials once for all O365 inboxes
        o365_client_id, o365_client_secret, o365_tenant_id = await get_office365_oauth_credentials(session)

        # Fallback tracking base URL (used when an inbox has no custom domain)
        from app.settings_manager import settings as _settings
        from app.app_settings import get_inbox_tracking_base
        _fallback_tracking_base = _settings.base_url.rstrip("/")

        for inbox in inboxes:
            # compute how many emails already sent today so we enforce a hard
            # daily cap rather than only relying on ``sent_this_inbox`` below.
            # Use the warmup-aware effective limit so ramp-up is respected.
            max_per_day = compute_effective_daily_limit(inbox)
            sent_count_result = await session.execute(
                select(func.count(EmailLog.id))
                .where(
                    EmailLog.inbox_id == inbox.id,
                    func.date(EmailLog.sent_at) == today,
                )
            )
            already_sent = sent_count_result.scalar() or 0
            quota_remaining = max_per_day - already_sent

            result = await session.execute(
                select(QueueSlot, CampaignLead, Campaign, Lead, Sequence)
                .join(CampaignLead, QueueSlot.campaign_lead_id == CampaignLead.id)
                .join(Campaign, CampaignLead.campaign_id == Campaign.id)
                .join(Lead, CampaignLead.lead_id == Lead.id)
                .join(
                    Sequence,
                    (Sequence.campaign_id == Campaign.id)
                    & (Sequence.position == QueueSlot.sequence_index),
                )
                .options(selectinload(Sequence.variants))
                .where(
                    QueueSlot.inbox_id == inbox.id,
                    func.date(QueueSlot.scheduled_date) == today,
                    QueueSlot.scheduled_date <= now,
                )
                .order_by(QueueSlot.scheduled_date, QueueSlot.position_in_day)
            )
            rows = result.all()

            if quota_remaining <= 0:
                if not rows:
                    # An inbox that already exhausted its quota but has no due
                    # work should not emit repeated daily_limit safeguards.
                    continue
                # we would break the daily limit even before sending a single
                # message; try a recalculation to redistribute, then report.
                log.warning("Daily limit hit for inbox %s; attempting recalculation", inbox.email)
                try:
                    from app.routers.schedule import recalculate_all_campaigns
                    await recalculate_all_campaigns(session)
                    # Re-check after recalculation
                    recheck = await session.execute(
                        select(func.count(EmailLog.id)).where(
                            EmailLog.inbox_id == inbox.id,
                            func.date(EmailLog.sent_at) == today,
                        )
                    )
                    still_over = (recheck.scalar() or 0) >= max_per_day
                    if still_over:
                        await fire_webhook_event(
                            session, "daily_limit",
                            {"inbox_id": inbox.id, "inbox_email": inbox.email, "date": str(today),
                             "recalculated": True, "resolved": False},
                        )
                    else:
                        await fire_webhook_event(
                            session, "daily_limit",
                            {"inbox_id": inbox.id, "inbox_email": inbox.email, "date": str(today),
                             "recalculated": True, "resolved": True,
                             "message": "Daily limit was hit but resolved after recalculation"},
                        )
                        # Update quota_remaining after recalc
                        quota_remaining = max_per_day - (recheck.scalar() or 0)
                        if quota_remaining > 0:
                            continue  # retry this inbox with fresh capacity
                except Exception as e:
                    log.error("Recalculation after daily_limit failed: %s", e)
                    await fire_webhook_event(
                        session, "daily_limit",
                        {"inbox_id": inbox.id, "inbox_email": inbox.email, "date": str(today)},
                    )
                continue

            if not rows:
                continue

            # ── Fetch provider-specific credentials ──────────────────────
            _creds = await resolve_inbox_send_credentials(session, inbox)
            gmail_token = _creds["gmail_token"]
            ga = _creds["ga"]
            o365_account = _creds["o365_account"]
            simulate_send = _creds["simulate_send"]
            if not _creds["ok"]:
                continue

            sent_this_inbox = 0
            # Use the warmup-aware effective limit as the per-inbox rate cap.
            max_per_day = compute_effective_daily_limit(inbox)

            # compute last sent timestamp so we can enforce the wait-minutes
            last_sent_time = None

            # Per-inbox tracking base URL — custom domain takes priority
            inbox_tracking_base = get_inbox_tracking_base(inbox, _fallback_tracking_base)
            last_sent_res = await session.execute(
                select(EmailLog.sent_at)
                .where(EmailLog.inbox_id == inbox.id)
                .order_by(EmailLog.sent_at.desc())
                .limit(1)
            )
            last_sent_time = last_sent_res.scalar_one_or_none()

            for slot, cl, campaign, lead, sequence in rows:
                # HARD LIMIT: daily quota
                if sent_this_inbox >= quota_remaining:
                    await fire_webhook_event(
                        session,
                        "daily_limit",
                        {"inbox_id": inbox.id, "inbox_email": inbox.email, "date": str(today)},
                    )
                    break

                # HARD LIMIT: rate/minutes between messages
                if last_sent_time is not None:
                    delta = now - last_sent_time
                    required = timedelta(minutes=inbox.wait_minutes_between)
                    # allow up to 20 second of slack before firing rate_limit
                    if delta + timedelta(seconds=20) < required:
                        # Try recalculation to spread slots out
                        try:
                            from app.routers.schedule import recalculate_all_campaigns
                            await recalculate_all_campaigns(session)
                            # Re-fetch the last sent time after recalc
                            recheck_res = await session.execute(
                                select(EmailLog.sent_at)
                                .where(EmailLog.inbox_id == inbox.id)
                                .order_by(EmailLog.sent_at.desc())
                                .limit(1)
                            )
                            new_last = recheck_res.scalar_one_or_none()
                            new_delta = now - new_last if new_last else delta
                            if new_delta + timedelta(seconds=20) < required:
                                await fire_webhook_event(
                                    session, "rate_limit",
                                    {"inbox_id": inbox.id, "inbox_email": inbox.email,
                                     "last_sent": (new_last or last_sent_time).isoformat(),
                                     "now": now.isoformat(),
                                     "wait_minutes": inbox.wait_minutes_between,
                                     "recalculated": True, "resolved": False},
                                )
                            else:
                                await fire_webhook_event(
                                    session, "rate_limit",
                                    {"inbox_id": inbox.id, "inbox_email": inbox.email,
                                     "last_sent": (new_last or last_sent_time).isoformat(),
                                     "now": now.isoformat(),
                                     "wait_minutes": inbox.wait_minutes_between,
                                     "recalculated": True, "resolved": True,
                                     "message": "Rate limit was hit but resolved after recalculation"},
                                )
                                last_sent_time = new_last
                                continue  # try next slot
                        except Exception as e:
                            log.error("Recalculation after rate_limit failed: %s", e)
                            await fire_webhook_event(
                                session, "rate_limit",
                                {"inbox_id": inbox.id, "inbox_email": inbox.email,
                                 "last_sent": last_sent_time.isoformat(),
                                 "now": now.isoformat(),
                                 "wait_minutes": inbox.wait_minutes_between},
                            )
                        break
                if getattr(campaign, 'paused', False):
                    continue  # Skip paused campaigns
                if not _in_sending_window(now, campaign):
                    break

                if not campaign_lead_may_receive_sends(cl, lead):
                    await session.delete(slot)
                    continue
                if campaign.stop_on_reply:
                    reply_check = await session.execute(
                        select(LeadReply).where(
                            LeadReply.lead_id == lead.id,
                            LeadReply.campaign_id == campaign.id,
                        )
                    )
                    if reply_check.scalar_one_or_none():
                        await session.delete(slot)
                        continue

                reply_to_msg_id = None
                prev_thread_id = None
                references_chain = None
                reply_graph_message_id = None  # O365 Graph internal message ID for reply API
                prev_email_body_plain: str = ""
                prev_email_body_html: str = ""
                prev_sent_at = None

                # ── A/B variant selection ─────────────────────────────────────
                chosen_variant_id = None
                seq_subject      = sequence.subject
                seq_body         = sequence.body
                seq_is_html      = sequence.is_html
                seq_preview_text = getattr(sequence, 'preview_text', None)

                if getattr(sequence, "sequence_type", "standard") != "personalized":
                    enabled_variants = [
                        v for v in getattr(sequence, 'variants', []) if v.enabled
                    ]
                    if enabled_variants:
                        # Use the pre-assigned variant if one exists on the slot
                        chosen = None
                        if slot.variant_id is not None:
                            chosen = next(
                                (v for v in enabled_variants if v.id == slot.variant_id),
                                None,
                            )
                        # Fallback: random selection (legacy slots without pre-assignment)
                        if chosen is None:
                            # options: None = default content, or any enabled variant
                            options = [None] + enabled_variants
                            chosen = random.choice(options)
                        if chosen is not None:
                            chosen_variant_id = chosen.id
                            if chosen.subject is not None:
                                seq_subject = chosen.subject
                            if chosen.body:
                                seq_body = chosen.body
                            if chosen.is_html is not None:
                                seq_is_html = chosen.is_html
                            if chosen.preview_text is not None:
                                seq_preview_text = chosen.preview_text
                            log.info(
                                "A/B: slot=%s seq=%s chose variant_id=%s label=%r",
                                slot.id, sequence.id, chosen_variant_id, chosen.label,
                            )

                # ── Personalized sequence override ────────────────────────────
                if getattr(sequence, "sequence_type", "standard") == "personalized":
                    ov_res = await session.execute(
                        select(CustomEmailOverride).where(
                            CustomEmailOverride.campaign_lead_id == cl.id,
                            CustomEmailOverride.sequence_id == sequence.id,
                        )
                    )
                    override = ov_res.scalar_one_or_none()
                    if override:
                        if override.subject is not None:
                            seq_subject = override.subject
                        elif sequence.fallback_subject:
                            seq_subject = sequence.fallback_subject
                        if override.body is not None:
                            seq_body = override.body
                        elif sequence.fallback_body:
                            seq_body = sequence.fallback_body
                        if override.is_html is not None:
                            seq_is_html = override.is_html
                        log.info(
                            "Personalized override: slot=%s seq=%s lead=%s using custom content",
                            slot.id, sequence.id, lead.id,
                        )
                    elif sequence.fallback_subject or sequence.fallback_body:
                        # No override row — use fallback content as safety net
                        if sequence.fallback_subject:
                            seq_subject = sequence.fallback_subject
                        if sequence.fallback_body:
                            seq_body = sequence.fallback_body
                        log.info(
                            "Personalized fallback (no override): slot=%s seq=%s lead=%s",
                            slot.id, sequence.id, lead.id,
                        )

                if (seq_subject or "").strip() == "":
                    # Fetch ALL prior emails in this lead+campaign thread for proper References chain
                    all_logs_result = await session.execute(
                        select(EmailLog).where(
                            EmailLog.lead_id == lead.id,
                            EmailLog.campaign_id == campaign.id,
                            EmailLog.message_id.isnot(None),
                            EmailLog.message_id != "",
                        ).order_by(EmailLog.sent_at.asc())
                    )
                    all_logs = all_logs_result.scalars().all()

                    if all_logs:
                        # In-Reply-To = most recent message (direct parent)
                        reply_to_msg_id = all_logs[-1].message_id
                        # References = ALL message IDs in order (space-separated)
                        references_chain = " ".join(
                            (mid if mid.startswith("<") else f"<{mid}>")
                            for log_entry in all_logs
                            if (mid := log_entry.message_id)
                        )
                        # Gmail threadId from most recent
                        prev_thread_id = all_logs[-1].thread_id
                        # Guard: reject a thread_id that belongs to a *different* campaign
                        # for this lead.  Gmail may subject-match the very first email of
                        # this campaign into an existing thread from a previous campaign with
                        # the same subject — we must not continue that foreign thread.
                        if prev_thread_id:
                            _cross_camp_row = await session.execute(
                                select(EmailLog.id).where(
                                    EmailLog.lead_id == lead.id,
                                    EmailLog.thread_id == prev_thread_id,
                                    EmailLog.campaign_id != campaign.id,
                                ).limit(1)
                            )
                            if _cross_camp_row.scalar_one_or_none():
                                log.warning(
                                    "Thread %s for lead_id=%s is shared with another "
                                    "campaign – clearing thread_id to prevent "
                                    "cross-campaign contamination",
                                    prev_thread_id, lead.id,
                                )
                                prev_thread_id = None
                        # Subject: Re: <original subject> from the FIRST email that had a real subject
                        first_with_subject = next(
                            (e for e in all_logs if e.subject and e.subject.strip() and e.subject != "(no subject)"),
                            None,
                        )
                        if first_with_subject:
                            orig_subj = first_with_subject.subject
                            if orig_subj.lower().startswith("re: "):
                                subject = orig_subj
                            else:
                                subject = f"Re: {orig_subj}"
                        else:
                            subject = "(no subject)"

                        # Fetch the previous email's body for quoting from the
                        # sequence/variant definition.  This is always available
                        # (no dependency on Gmail/O365 unibox sync) and is
                        # campaign-scoped by construction, so quoting can never
                        # accidentally include content from a different campaign's thread.
                        prev_sent_at = all_logs[-1].sent_at
                        _prev_log = all_logs[-1]
                        _prev_seq_row = await session.execute(
                            select(Sequence).where(
                                Sequence.campaign_id == campaign.id,
                                Sequence.position == _prev_log.sequence_index,
                            )
                        )
                        _prev_seq = _prev_seq_row.scalar_one_or_none()
                        if _prev_seq:
                            _prev_body_raw = _prev_seq.body or ""
                            _prev_is_html_raw = _prev_seq.is_html
                            # Override with the variant content if a variant was chosen
                            # for the previous send (same logic used at send time).
                            if _prev_log.variant_id:
                                _prev_var_row = await session.execute(
                                    select(SequenceVariant).where(
                                        SequenceVariant.id == _prev_log.variant_id
                                    )
                                )
                                _prev_var = _prev_var_row.scalar_one_or_none()
                                if _prev_var and _prev_var.body:
                                    _prev_body_raw = _prev_var.body
                                    if _prev_var.is_html is not None:
                                        _prev_is_html_raw = _prev_var.is_html
                            _rendered_prev = render_body(_prev_body_raw, get_lead_data(lead))
                            if _prev_is_html_raw:
                                prev_email_body_html = _rendered_prev
                            else:
                                prev_email_body_plain = _rendered_prev

                        # For O365 inboxes, look up the Graph internal message ID of
                        # the message we are replying to so we can use the Graph
                        # Reply API and preserve the correct conversationIndex.
                        # Primary: match by internet_message_id (RFC 2822 Message-ID)
                        # so the lookup is campaign-scoped regardless of which
                        # conversation_id Gmail may have assigned.
                        if inbox.provider == "office365" and reply_to_msg_id:
                            _needle_msgid = (
                                reply_to_msg_id
                                if reply_to_msg_id.startswith("<")
                                else f"<{reply_to_msg_id}>"
                            )
                            o365_real_row = await session.execute(
                                select(Office365Message)
                                .where(
                                    Office365Message.inbox_id == inbox.id,
                                    Office365Message.internet_message_id == _needle_msgid,
                                    ~Office365Message.message_id.startswith("local-"),
                                )
                                .limit(1)
                            )
                            o365_real_msg = o365_real_row.scalar_one_or_none()
                            # Fallback: latest real Graph message in the conversation.
                            if not o365_real_msg and prev_thread_id:
                                o365_real_row = await session.execute(
                                    select(Office365Message)
                                    .where(
                                        Office365Message.inbox_id == inbox.id,
                                        Office365Message.conversation_id == prev_thread_id,
                                        ~Office365Message.message_id.startswith("local-"),
                                    )
                                    .order_by(Office365Message.received_at.desc())
                                    .limit(1)
                                )
                                o365_real_msg = o365_real_row.scalar_one_or_none()
                            if o365_real_msg:
                                reply_graph_message_id = o365_real_msg.message_id
                    else:
                        subject = "(no subject)"
                else:
                    subject = seq_subject.strip()

                # Apply lead-data variable substitution to the subject line
                # (same {{firstName}} / {{company}} etc. tokens as the body).
                subject = render_body(subject, get_lead_data(lead))

                # ── Determine HTML mode ──────────────────────────────────────
                # Override chain (highest → lowest priority):
                #   1. Settings-level text-only (send_all_as_text / send_first_as_text)
                #   2. Tracking requires HTML (tracking overrides text → html)
                #   3. Sequence-level is_html checkbox
                #   4. Legacy auto-detect from body content
                format_override = None  # tracks if/why format was overridden

                if getattr(campaign, 'send_all_as_text', False):
                    is_html = False
                    # Check if tracking would have wanted HTML
                    wants_tracking = (
                        getattr(campaign, 'track_opens', False)
                        or getattr(campaign, 'track_clicks', False)
                    )
                    if wants_tracking:
                        format_override = "text_forced_tracking_disabled"
                elif getattr(campaign, 'send_first_as_text', False) and slot.sequence_index == 0:
                    is_html = False
                    wants_tracking = (
                        getattr(campaign, 'track_opens', False)
                        or getattr(campaign, 'track_clicks', False)
                    )
                    if wants_tracking:
                        format_override = "first_text_tracking_disabled"
                else:
                    # Determine base format from sequence or auto-detect
                    if seq_is_html is not None:
                        is_html = bool(seq_is_html)
                    else:
                        is_html = bool(re.search(r'<[a-zA-Z][^>]*>', seq_body or ""))

                    # Tracking override: if tracking is on and sequence is plain text,
                    # upgrade to HTML so the pixel/links can be injected
                    if not is_html and (
                        getattr(campaign, 'track_opens', False)
                        or getattr(campaign, 'track_clicks', False)
                    ):
                        is_html = True
                        format_override = "tracking_upgraded_to_html"

                # ── Unsubscribe token (fetch or create) ──────────────────────
                unsub_token_res = await session.execute(
                    select(LeadUnsubscribeToken).where(
                        LeadUnsubscribeToken.lead_id == lead.id,
                        LeadUnsubscribeToken.campaign_id == campaign.id,
                    )
                )
                unsub_row = unsub_token_res.scalar_one_or_none()
                if unsub_row is None:
                    unsub_row = LeadUnsubscribeToken(
                        lead_id=lead.id,
                        campaign_id=campaign.id,
                        token=secrets.token_urlsafe(32),
                    )
                    session.add(unsub_row)
                    await session.flush()  # get the token persisted

                unsub_url = f"{inbox_tracking_base}/u/{unsub_row.token}"

                # Build lead data dict with built-in unsubscribe_link variable
                lead_data = get_lead_data(lead)
                lead_data["unsubscribe_link"] = unsub_url

                body = render_body(seq_body, lead_data)
                # Inject hidden preheader so email clients show the custom preview text.
                if is_html and seq_preview_text:
                    rendered_preview = render_body(seq_preview_text, lead_data)
                    preheader = (
                        '<div style="display:none !important; visibility:hidden; '
                        'font-size:1px; overflow:hidden; max-height:0; mso-hide:all;">'
                        f'{rendered_preview}</div>'
                    )
                    body = preheader + body
                from_addr = inbox.email
                from_name = inbox.display_name or ""

                # ── phase 1: pre-create EmailLog to get an ID for tracking ──
                from app.send_diagnostics import snapshot_auth_status
                from app.content_risk import score_content
                _send_domain = (from_addr.split("@")[-1] if "@" in from_addr else "")
                _auth_snapshot = await snapshot_auth_status(_send_domain)
                _content_risk = score_content(subject, body)

                email_log_entry = EmailLog(
                    lead_id=lead.id,
                    campaign_id=campaign.id,
                    inbox_id=inbox.id,
                    sequence_index=slot.sequence_index,
                    variant_id=chosen_variant_id,
                    subject=subject,
                    format_override=format_override,
                    message_id="",      # filled in after successful send
                    thread_id=prev_thread_id,
                    auth_snapshot=_auth_snapshot,
                    content_risk_score=_content_risk["score"],
                    content_risk_flags=_content_risk["flags"],
                )
                session.add(email_log_entry)
                await session.flush()  # acquire email_log_entry.id

                # ── phase 2: inject open/click tracking into HTML bodies ────
                send_body = body
                link_pairs: list = []
                do_track = is_html and (
                    getattr(campaign, 'track_opens', False)
                    or getattr(campaign, 'track_clicks', False)
                )
                if do_track:
                    from app.tracking import inject_tracking_html
                    from app.models import TrackedLink as _TrackedLink
                    send_body, link_pairs = inject_tracking_html(
                        body,
                        email_log_entry.id,
                        inbox_tracking_base,
                        track_opens=getattr(campaign, 'track_opens', False),
                        track_clicks=getattr(campaign, 'track_clicks', False),
                        open_token=email_log_entry.open_token,
                    )
                    for _token, _url in link_pairs:
                        session.add(
                            _TrackedLink(
                                email_log_id=email_log_entry.id,
                                token=_token,
                                original_url=_url,
                            )
                        )

                if getattr(inbox, "beacon_connected", False):
                    from app.beacon_client import register_beacon_mappings

                    iid = inbox.id
                    b_items: list[dict] = [
                        {"kind": "unsubscribe", "token": unsub_row.token, "inbox_id": iid}
                    ]
                    if do_track:
                        b_items.insert(0, {"kind": "open", "token": email_log_entry.open_token, "inbox_id": iid})
                        for _token, _url in link_pairs:
                            b_items.append(
                                {"kind": "click", "token": _token, "original_url": _url, "inbox_id": iid}
                            )
                    try:
                        await register_beacon_mappings(inbox, b_items)
                    except Exception:
                        log.exception(
                            "Beacon register failed for email_log_id=%s; aborting send",
                            email_log_entry.id,
                        )
                        await session.delete(email_log_entry)
                        continue

                # ── Append quoted previous email (follow-up sequences only) ──
                if prev_sent_at and (prev_email_body_html or prev_email_body_plain):
                    _from_name = inbox.display_name or inbox.email
                    _from_email = inbox.email
                    if is_html:
                        _prev_html = prev_email_body_html or _plain_to_quoted_html(prev_email_body_plain)
                        send_body = send_body + build_quote_html(
                            _prev_html, _from_name, _from_email, prev_sent_at
                        )
                    else:
                        _prev_plain = prev_email_body_plain or _strip_html_tags(prev_email_body_html)
                        if _prev_plain:
                            send_body = send_body + build_quote_plain(
                                _prev_plain, _from_name, _from_email, prev_sent_at
                            )

                # Unsubscribe header
                list_unsub_url = unsub_url if getattr(campaign, 'add_unsubscribe_header', True) else None

                # ── phase 3: send ────────────────────────────────────────────
                if simulate_send:
                    fake_thread_id = prev_thread_id or f"test-thread-{email_log_entry.id}"
                    result = SendResult(
                        message_id=make_msgid(domain="test.local"),
                        thread_id=fake_thread_id,
                        gmail_message_id=f"test-gmail-{email_log_entry.id}",
                    )
                else:
                    result = send_email(
                        to_email=lead.email,
                        subject=subject,
                        body=send_body,
                        from_email=from_addr,
                        from_name=from_name,
                        reply_to_msg_id=reply_to_msg_id,
                        references=references_chain,
                        is_html=is_html,
                        provider=inbox.provider or "gmail",
                        gmail_access_token=gmail_token,
                        gmail_account=ga,
                        thread_id=prev_thread_id,
                        list_unsubscribe_url=list_unsub_url,
                        google_client_id=g_client_id,
                        google_client_secret=g_client_secret,
                        office365_account=o365_account,
                        office365_client_id=o365_client_id,
                        office365_client_secret=o365_client_secret,
                        office365_tenant_id=o365_tenant_id,
                        smtp_host=inbox.smtp_host or "",
                        smtp_port=inbox.smtp_port,
                        smtp_username=inbox.smtp_username or "",
                        smtp_password=inbox.smtp_password or "",
                        smtp_encryption=inbox.smtp_encryption or "starttls",
                        conversation_id=prev_thread_id if inbox.provider == "office365" else None,
                        reply_graph_message_id=reply_graph_message_id if inbox.provider == "office365" else None,
                    )

                # ── Handle permanent failure (bounce / auth) ─────────────────
                if isinstance(result, SendFailure):
                    log.warning(
                        "Permanent send failure for lead_id=%s inbox=%s: [%s] %s",
                        lead.id, inbox.email, result.error_type, result.message,
                    )
                    # Delete the pre-created log entry
                    await session.delete(email_log_entry)

                    # Mark lead as bounced and delete remaining queue slots
                    if result.error_type in ("bounce", "invalid_recipient"):
                        prev_enr = getattr(cl, "enrollment_status", None) or "active"
                        cl.enrollment_status = "bounced"
                        cl.bounce_type = result.bounce_type or "hard"
                        session.add(BounceEvent(
                            lead_id=lead.id,
                            campaign_id=campaign.id,
                            inbox_id=inbox.id,
                            bounce_type=result.bounce_type or "hard",
                            error_message=result.message,
                        ))
                        # Delete ALL remaining queue slots for this lead+campaign
                        from sqlalchemy import delete as sql_delete
                        await session.execute(
                            sql_delete(QueueSlot).where(
                                QueueSlot.campaign_lead_id == cl.id,
                            )
                        )
                        await fire_webhook_event(session, "email.bounced", {
                            "lead_id": lead.id,
                            "lead_email": lead.email,
                            "campaign_id": campaign.id,
                            "inbox_id": inbox.id,
                            "error_type": result.error_type,
                            "bounce_type": cl.bounce_type,
                            "error_message": result.message,
                            "timestamp": time_provider.utcnow().isoformat() + "Z",
                        })
                        await fire_webhook_event(session, "lead.status_changed", {
                            "lead_id": lead.id,
                            "lead_email": lead.email,
                            "campaign_id": campaign.id,
                            "old_enrollment_status": prev_enr,
                            "new_enrollment_status": "bounced",
                            "reason": result.message,
                            "timestamp": time_provider.utcnow().isoformat() + "Z",
                        })
                    elif result.error_type in ("auth_failed", "permission_denied"):
                        await fire_webhook_event(session, "token_expired", {
                            "inbox_id": inbox.id,
                            "inbox_email": inbox.email,
                            "error": result.message,
                        })
                        # Stop processing this inbox — auth is broken
                        break
                    continue

                if not result:
                    # Transient failure — roll back the pre-created log; slot stays for retry
                    await session.delete(email_log_entry)
                    continue

                # ── success: update log and consume the slot ─────────────────
                email_log_entry.message_id = result.message_id
                email_log_entry.thread_id = result.thread_id or prev_thread_id
                await session.delete(slot)
                await _update_enrollment_after_send(session, cl, campaign, sequence)
                sent_this_inbox += 1
                total_sent += 1
                quota_remaining -= 1
                # update last_sent_time for rate-limit comparisons
                last_sent_time = now

                # For Gmail: save the sent message to the local mirror so the body
                # is available for quoting in future follow-up emails.
                if inbox.provider != "office365" and email_log_entry.thread_id:
                    try:
                        from app.unibox import upsert_sent_message as _upsert_sent_gmail
                        await _upsert_sent_gmail(
                            session,
                            inbox_id=inbox.id,
                            thread_id=email_log_entry.thread_id,
                            gmail_message_id=result.gmail_message_id,
                            rfc_message_id=result.message_id,
                            subject=subject,
                            to_email=lead.email,
                            from_email=inbox.email,
                            body=send_body,
                            is_html=is_html,
                        )
                    except Exception:
                        log.exception(
                            "Failed to upsert sent Gmail message to unibox "
                            "inbox_id=%s lead=%s",
                            inbox.id, lead.email,
                        )

                # For Office 365: immediately save the sent message to the local
                # mirror so it appears in the unibox thread before the next sync.
                if inbox.provider == "office365" and email_log_entry.thread_id:
                    try:
                        from app.unibox import upsert_sent_o365_message
                        await upsert_sent_o365_message(
                            session,
                            inbox_id=inbox.id,
                            conversation_id=email_log_entry.thread_id,
                            internet_message_id=result.message_id,
                            subject=subject,
                            to_email=lead.email,
                            from_email=inbox.email,
                            body=send_body,
                            is_html=is_html,
                        )
                    except Exception:
                        log.exception(
                            "Failed to upsert sent O365 message to unibox "
                            "inbox_id=%s lead=%s",
                            inbox.id, lead.email,
                        )

                # Fire email.sent webhook
                await fire_webhook_event(session, "email.sent", {
                    "email_log_id": email_log_entry.id,
                    "lead_id": lead.id,
                    "lead_email": lead.email,
                    "campaign_id": campaign.id,
                    "inbox_id": inbox.id,
                    "inbox_email": inbox.email,
                    "subject": subject,
                    "sequence_index": slot.sequence_index,
                    "message_id": result.message_id,
                    "thread_id": result.thread_id,
                    "timestamp": time_provider.utcnow().isoformat() + "Z",
                })

                # ── Test mode: simulate random engagement events ─────────
                if settings.test_mode:
                    from app.models import EmailOpen, EmailClick, TrackedLink as _TL
                    fake_ip = f"10.0.{random.randint(0,255)}.{random.randint(1,254)}"

                    # ~40% chance of open
                    if random.random() < 0.4:
                        email_log_entry.opened = True
                        session.add(EmailOpen(
                            email_log_id=email_log_entry.id,
                            ip_address=fake_ip,
                        ))
                        await fire_webhook_event(session, "email.opened", {
                            "email_log_id": email_log_entry.id,
                            "lead_id": lead.id,
                            "campaign_id": campaign.id,
                            "ip_address": fake_ip,
                            "timestamp": time_provider.utcnow().isoformat() + "Z",
                        })
                        log.info("TEST MODE: simulated open for email_log_id=%s", email_log_entry.id)

                    # ~20% chance of click (only if opened)
                    if email_log_entry.opened and random.random() < 0.5:
                        email_log_entry.clicked = True
                        session.add(EmailClick(
                            email_log_id=email_log_entry.id,
                            ip_address=fake_ip,
                            clicked_at=time_provider.utcnow(),
                        ))
                        await fire_webhook_event(session, "email.clicked", {
                            "email_log_id": email_log_entry.id,
                            "lead_id": lead.id,
                            "campaign_id": campaign.id,
                            "original_url": "https://example.com/test-link",
                            "ip_address": fake_ip,
                            "timestamp": time_provider.utcnow().isoformat() + "Z",
                        })
                        log.info("TEST MODE: simulated click for email_log_id=%s", email_log_entry.id)

                    # ~15% chance of reply
                    if random.random() < 0.15:
                        fake_reply = LeadReply(
                            lead_id=lead.id, campaign_id=campaign.id,
                            replied_at=time_provider.utcnow(),
                        )
                        session.add(fake_reply)
                        await session.flush()
                        await fire_webhook_event(session, "lead.replied", {
                            "lead_id": lead.id,
                            "lead_email": lead.email,
                            "lead_name": lead.name or "",
                            "thread_id": email_log_entry.thread_id,
                            "inbox_id": inbox.id,
                            "inbox_email": inbox.email,
                            "reply_id": fake_reply.id,
                            "timestamp": time_provider.utcnow().isoformat() + "Z",
                        })
                        log.info("TEST MODE: simulated reply for email_log_id=%s lead_id=%s", email_log_entry.id, lead.id)

        await session.commit()

    last_send_job_run = time_provider.now()
    last_send_job_sent_count = total_sent
    log.info("Send job finished: %d email(s) sent (next run in %d min)", total_sent, settings.queue_check_interval_minutes)


# ---------------------------------------------------------------------------
# Per-slot job: fired by APScheduler at the slot's exact scheduled_date
# ---------------------------------------------------------------------------

async def send_slot_job(slot_id: int) -> None:
    """Send a single queue slot identified by *slot_id*.

    Called by APScheduler as a DateTrigger job at the slot's ``scheduled_date``.
    All business-rule checks (quota, rate limit, sending window, etc.) are
    applied here; a slot that cannot be sent at fire time is simply skipped –
    the slot row remains in the database so the next recalculation can
    reschedule it.
    """
    global last_send_job_run, last_send_job_sent_count

    now = time_provider.utcnow()  # must be UTC � _in_sending_window converts to campaign tz
    log.info("send_slot_job: slot_id=%d firing at %s", slot_id, now.isoformat())

    async with AsyncSessionLocal() as session:
        # ── Load slot + all related entities in one query ────────────────
        slot_res = await session.execute(
            select(QueueSlot, CampaignLead, Campaign, Lead, Sequence, Inbox)
            .join(CampaignLead, QueueSlot.campaign_lead_id == CampaignLead.id)
            .join(Campaign, CampaignLead.campaign_id == Campaign.id)
            .join(Lead, CampaignLead.lead_id == Lead.id)
            .join(
                Sequence,
                (Sequence.campaign_id == Campaign.id)
                & (Sequence.position == QueueSlot.sequence_index),
                isouter=True,
            )
            .join(Inbox, QueueSlot.inbox_id == Inbox.id)
            .options(selectinload(Sequence.variants))
            .where(QueueSlot.id == slot_id)
        )
        row = slot_res.first()
        if not row:
            log.info("send_slot_job: slot %d not found – already sent or cancelled", slot_id)
            return

        slot, cl, campaign, lead, sequence, inbox = row

        # ── Pre-flight checks ────────────────────────────────────────────
        if inbox.paused:
            log.info("send_slot_job: inbox %s paused, skipping slot %d", inbox.email, slot_id)
            return
        if getattr(campaign, "paused", False):
            log.info("send_slot_job: campaign %d paused, skipping slot %d", campaign.id, slot_id)
            return
        if not campaign_lead_may_receive_sends(cl, lead):
            log.info(
                "send_slot_job: lead %d not sendable for campaign_lead %d, dropping slot %d",
                lead.id, cl.id, slot_id,
            )
            await session.delete(slot)
            await session.commit()
            return
        if not _in_sending_window(now, campaign):
            log.info("send_slot_job: outside sending window for campaign %d, skipping slot %d",
                     campaign.id, slot_id)
            return

        # ── Daily quota check ────────────────────────────────────────────
        today = now.date()
        max_per_day = compute_effective_daily_limit(inbox)
        sent_count_res = await session.execute(
            select(func.count(EmailLog.id))
            .where(EmailLog.inbox_id == inbox.id, func.date(EmailLog.sent_at) == today)
        )
        already_sent = sent_count_res.scalar() or 0
        if already_sent >= max_per_day:
            log.warning(
                "send_slot_job: daily limit hit for inbox %s (sent=%d cap=%d), skipping slot %d",
                inbox.email, already_sent, max_per_day, slot_id,
            )
            await fire_webhook_event(
                session, "daily_limit",
                {"inbox_id": inbox.id, "inbox_email": inbox.email, "date": str(today)},
            )
            await session.commit()
            return

        # ── Rate-limit check ─────────────────────────────────────────────
        last_sent_res = await session.execute(
            select(EmailLog.sent_at)
            .where(EmailLog.inbox_id == inbox.id)
            .order_by(EmailLog.sent_at.desc())
            .limit(1)
        )
        last_sent_time = last_sent_res.scalar_one_or_none()
        if last_sent_time is not None:
            delta = now - last_sent_time
            required = timedelta(minutes=inbox.wait_minutes_between)
            if delta + timedelta(seconds=20) < required:
                log.info(
                    "send_slot_job: rate limit for inbox %s – "
                    "last sent %s ago (need %s), skipping slot %d",
                    inbox.email, delta, required, slot_id,
                )
                await fire_webhook_event(
                    session, "rate_limit",
                    {
                        "inbox_id": inbox.id, "inbox_email": inbox.email,
                        "last_sent": last_sent_time.isoformat(),
                        "now": now.isoformat(),
                        "wait_minutes": inbox.wait_minutes_between,
                    },
                )
                await session.commit()
                return

        # ── stop_on_reply check ──────────────────────────────────────────
        if campaign.stop_on_reply:
            reply_check = await session.execute(
                select(LeadReply).where(
                    LeadReply.lead_id == lead.id, LeadReply.campaign_id == campaign.id
                )
            )
            if reply_check.scalar_one_or_none():
                log.info(
                    "send_slot_job: lead %d already replied to campaign %d, dropping slot %d",
                    lead.id, campaign.id, slot_id,
                )
                await session.delete(slot)
                await session.commit()
                return


        # -- Email verification check ------------------------------------------
        # If verification is enabled and the lead's email is unverified,
        # verify it now. Block send if invalid or risky.
        _ev_status = getattr(lead, "email_verification_status", None)
        if _ev_status not in ("valid", "catch_all"):
            from app.app_settings import (
                EMAIL_VERIFICATION_ENABLED, EMAIL_VERIFICATION_API_KEY,
                EMAIL_VERIFICATION_PROVIDER, EMAIL_VERIFICATION_CUSTOM_URL,
                EMAIL_VERIFICATION_CUSTOM_FIELD, EMAIL_VERIFICATION_CUSTOM_VALID_VALUES,
                EMAIL_VERIFICATION_CUSTOM_INVALID_VALUES, EMAIL_VERIFICATION_CUSTOM_METHOD,
            )
            from app.settings_manager import get_setting_value
            _ev_enabled = await get_setting_value(session, EMAIL_VERIFICATION_ENABLED) or "false"
            if _ev_enabled.lower() in ("true", "1", "yes"):
                _ev_api_key = await get_setting_value(session, EMAIL_VERIFICATION_API_KEY) or ""
                _ev_provider = await get_setting_value(session, EMAIL_VERIFICATION_PROVIDER) or "mailtester_ninja"
                if _ev_api_key or _ev_provider == "custom":
                    try:
                        from app.email_verification import verify_single, BLOCK_SEND_STATUSES
                        if _ev_provider == "custom":
                            from app.email_verification import CustomHttpProvider
                            _custom_url = await get_setting_value(session, EMAIL_VERIFICATION_CUSTOM_URL) or ""
                            _custom_field = await get_setting_value(session, EMAIL_VERIFICATION_CUSTOM_FIELD) or ""
                            _custom_valid = (await get_setting_value(session, EMAIL_VERIFICATION_CUSTOM_VALID_VALUES) or "").split(",")
                            _custom_invalid = (await get_setting_value(session, EMAIL_VERIFICATION_CUSTOM_INVALID_VALUES) or "").split(",")
                            _custom_method = await get_setting_value(session, EMAIL_VERIFICATION_CUSTOM_METHOD) or "GET"
                            _ev_provider_obj = CustomHttpProvider(_custom_url, _custom_field, _custom_valid, _custom_invalid, _custom_method)
                            _ev_result = await _ev_provider_obj.verify(lead.email, _ev_api_key)
                        else:
                            _ev_result = await verify_single(lead.email, _ev_api_key, _ev_provider)
                        lead.email_verification_status = _ev_result.status
                        await session.flush()
                        log.info(
                            "send_slot_job: verified %s -> %s (slot %d)",
                            lead.email, _ev_result.status, slot_id,
                        )
                        if _ev_result.status in BLOCK_SEND_STATUSES:
                            log.info(
                                "send_slot_job: blocking send for %s status=%s slot=%d",
                                lead.email, _ev_result.status, slot_id,
                            )
                            cl.enrollment_status = "bounced"
                            cl.bounce_type = "hard"
                            await session.delete(slot)
                            await session.commit()
                            return
                    except Exception as _ev_exc:
                        log.warning("send_slot_job: email verification failed for %s: %s", lead.email, _ev_exc)
                        # On verification error, allow send to proceed

        # ── OAuth credentials ────────────────────────────────────────────
        g_client_id, g_client_secret = await get_google_oauth_credentials(session)
        o365_client_id, o365_client_secret, o365_tenant_id = await get_office365_oauth_credentials(session)

        _creds = await resolve_inbox_send_credentials(session, inbox)
        gmail_token = _creds["gmail_token"]
        ga = _creds["ga"]
        o365_account = _creds["o365_account"]
        simulate_send = _creds["simulate_send"]
        if not _creds["ok"]:
            log.warning("send_slot_job: no usable send credentials for inbox %s, skipping slot %d", inbox.email, slot_id)
            return

        # ── A/B variant selection ────────────────────────────────────────
        chosen_variant_id = None
        if slot.node_id is not None:
            # Branch-tree campaign: pull content from the SequenceNode instead
            # of a flat Sequence step. No A/B variants or personalized
            # overrides for tree nodes in this version.
            node_res = await session.execute(select(SequenceNode).where(SequenceNode.id == slot.node_id))
            node = node_res.scalar_one_or_none()
            if node is None:
                log.warning("send_slot_job: node %s not found for slot %d, skipping", slot.node_id, slot_id)
                return
            seq_subject      = node.subject
            seq_body         = node.body
            seq_is_html      = node.is_html
            seq_preview_text = node.preview_text
        else:
            seq_subject      = sequence.subject
            seq_body         = sequence.body
            seq_is_html      = sequence.is_html
            seq_preview_text = getattr(sequence, "preview_text", None)

            if getattr(sequence, "sequence_type", "standard") != "personalized":
                enabled_variants = [v for v in getattr(sequence, "variants", []) if v.enabled]
                if enabled_variants:
                    # Use the pre-assigned variant if one exists on the slot
                    chosen = None
                    if slot.variant_id is not None:
                        chosen = next(
                            (v for v in enabled_variants if v.id == slot.variant_id),
                            None,
                        )
                    # Fallback: random selection (legacy slots without pre-assignment)
                    if chosen is None:
                        options = [None] + enabled_variants
                        chosen = random.choice(options)
                    if chosen is not None:
                        chosen_variant_id = chosen.id
                        if chosen.subject is not None:
                            seq_subject = chosen.subject
                        if chosen.body:
                            seq_body = chosen.body
                        if chosen.is_html is not None:
                            seq_is_html = chosen.is_html
                        if chosen.preview_text is not None:
                            seq_preview_text = chosen.preview_text
                        log.info(
                            "send_slot_job: A/B: slot=%s seq=%s chose variant_id=%s label=%r",
                            slot.id, sequence.id, chosen_variant_id, chosen.label,
                        )

            # ── Personalized sequence override ───────────────────────────────
            if getattr(sequence, "sequence_type", "standard") == "personalized":
                ov_res = await session.execute(
                    select(CustomEmailOverride).where(
                        CustomEmailOverride.campaign_lead_id == cl.id,
                        CustomEmailOverride.sequence_id == sequence.id,
                    )
                )
                override = ov_res.scalar_one_or_none()
                if override:
                    if override.subject is not None:
                        seq_subject = override.subject
                    elif sequence.fallback_subject:
                        seq_subject = sequence.fallback_subject
                    if override.body is not None:
                        seq_body = override.body
                    elif sequence.fallback_body:
                        seq_body = sequence.fallback_body
                    if override.is_html is not None:
                        seq_is_html = override.is_html
                    log.info(
                        "send_slot_job: Personalized override: slot=%s seq=%s lead=%s",
                        slot.id, sequence.id, lead.id,
                    )
                elif sequence.fallback_subject or sequence.fallback_body:
                    if sequence.fallback_subject:
                        seq_subject = sequence.fallback_subject
                    if sequence.fallback_body:
                        seq_body = sequence.fallback_body
                    log.info(
                        "send_slot_job: Personalized fallback (no override): slot=%s seq=%s lead=%s",
                        slot.id, sequence.id, lead.id,
                    )
        # ── Thread / reply chain for follow-up sequences ─────────────────
        reply_to_msg_id = None
        prev_thread_id = None
        references_chain = None
        reply_graph_message_id = None
        prev_email_body_plain: str = ""
        prev_email_body_html: str = ""
        prev_sent_at = None

        if (seq_subject or "").strip() == "":
            all_logs_result = await session.execute(
                select(EmailLog).where(
                    EmailLog.lead_id == lead.id,
                    EmailLog.campaign_id == campaign.id,
                    EmailLog.message_id.isnot(None),
                    EmailLog.message_id != "",
                ).order_by(EmailLog.sent_at.asc())
            )
            all_logs = all_logs_result.scalars().all()

            if all_logs:
                reply_to_msg_id = all_logs[-1].message_id
                references_chain = " ".join(
                    (mid if mid.startswith("<") else f"<{mid}>")
                    for log_entry in all_logs
                    if (mid := log_entry.message_id)
                )
                prev_thread_id = all_logs[-1].thread_id
                if prev_thread_id:
                    _cross_camp_row = await session.execute(
                        select(EmailLog.id).where(
                            EmailLog.lead_id == lead.id,
                            EmailLog.thread_id == prev_thread_id,
                            EmailLog.campaign_id != campaign.id,
                        ).limit(1)
                    )
                    if _cross_camp_row.scalar_one_or_none():
                        log.warning(
                            "send_slot_job: thread %s for lead_id=%s shared with another "
                            "campaign – clearing thread_id",
                            prev_thread_id, lead.id,
                        )
                        prev_thread_id = None

                first_with_subject = next(
                    (e for e in all_logs if e.subject and e.subject.strip()
                     and e.subject != "(no subject)"),
                    None,
                )
                if first_with_subject:
                    orig_subj = first_with_subject.subject
                    subject = orig_subj if orig_subj.lower().startswith("re: ") else f"Re: {orig_subj}"
                else:
                    subject = "(no subject)"

                prev_sent_at = all_logs[-1].sent_at
                _prev_log = all_logs[-1]
                _prev_seq_row = await session.execute(
                    select(Sequence).where(
                        Sequence.campaign_id == campaign.id,
                        Sequence.position == _prev_log.sequence_index,
                    )
                )
                _prev_seq = _prev_seq_row.scalar_one_or_none()
                if _prev_seq:
                    _prev_body_raw = _prev_seq.body or ""
                    _prev_is_html_raw = _prev_seq.is_html
                    if _prev_log.variant_id:
                        _prev_var_row = await session.execute(
                            select(SequenceVariant).where(SequenceVariant.id == _prev_log.variant_id)
                        )
                        _prev_var = _prev_var_row.scalar_one_or_none()
                        if _prev_var and _prev_var.body:
                            _prev_body_raw = _prev_var.body
                            if _prev_var.is_html is not None:
                                _prev_is_html_raw = _prev_var.is_html
                    _rendered_prev = render_body(_prev_body_raw, get_lead_data(lead))
                    if _prev_is_html_raw:
                        prev_email_body_html = _rendered_prev
                    else:
                        prev_email_body_plain = _rendered_prev

                if inbox.provider == "office365" and reply_to_msg_id:
                    _needle_msgid = (
                        reply_to_msg_id
                        if reply_to_msg_id.startswith("<")
                        else f"<{reply_to_msg_id}>"
                    )
                    o365_real_row = await session.execute(
                        select(Office365Message)
                        .where(
                            Office365Message.inbox_id == inbox.id,
                            Office365Message.internet_message_id == _needle_msgid,
                            ~Office365Message.message_id.startswith("local-"),
                        )
                        .limit(1)
                    )
                    o365_real_msg = o365_real_row.scalar_one_or_none()
                    if not o365_real_msg and prev_thread_id:
                        o365_real_row = await session.execute(
                            select(Office365Message)
                            .where(
                                Office365Message.inbox_id == inbox.id,
                                Office365Message.conversation_id == prev_thread_id,
                                ~Office365Message.message_id.startswith("local-"),
                            )
                            .order_by(Office365Message.received_at.desc())
                            .limit(1)
                        )
                        o365_real_msg = o365_real_row.scalar_one_or_none()
                    if o365_real_msg:
                        reply_graph_message_id = o365_real_msg.message_id
            else:
                subject = "(no subject)"
        else:
            subject = seq_subject.strip()

        subject = render_body(subject, get_lead_data(lead))

        # ── HTML / plain-text decision ────────────────────────────────────
        format_override = None
        if getattr(campaign, "send_all_as_text", False):
            is_html = False
            if getattr(campaign, "track_opens", False) or getattr(campaign, "track_clicks", False):
                format_override = "text_forced_tracking_disabled"
        elif getattr(campaign, "send_first_as_text", False) and slot.sequence_index == 0:
            is_html = False
            if getattr(campaign, "track_opens", False) or getattr(campaign, "track_clicks", False):
                format_override = "first_text_tracking_disabled"
        else:
            if seq_is_html is not None:
                is_html = bool(seq_is_html)
            else:
                is_html = bool(re.search(r"<[a-zA-Z][^>]*>", seq_body or ""))
            if not is_html and (
                getattr(campaign, "track_opens", False) or getattr(campaign, "track_clicks", False)
            ):
                is_html = True
                format_override = "tracking_upgraded_to_html"

        # ── Unsubscribe token ─────────────────────────────────────────────
        unsub_token_res = await session.execute(
            select(LeadUnsubscribeToken).where(
                LeadUnsubscribeToken.lead_id == lead.id,
                LeadUnsubscribeToken.campaign_id == campaign.id,
            )
        )
        unsub_row = unsub_token_res.scalar_one_or_none()
        if unsub_row is None:
            unsub_row = LeadUnsubscribeToken(
                lead_id=lead.id,
                campaign_id=campaign.id,
                token=secrets.token_urlsafe(32),
            )
            session.add(unsub_row)
            await session.flush()

        unsub_url = f"{inbox_tracking_base}/u/{unsub_row.token}"
        lead_data = get_lead_data(lead)
        lead_data["unsubscribe_link"] = unsub_url

        body = render_body(seq_body, lead_data)
        if is_html and seq_preview_text:
            rendered_preview = render_body(seq_preview_text, lead_data)
            preheader = (
                '<div style="display:none !important; visibility:hidden; '
                'font-size:1px; overflow:hidden; max-height:0; mso-hide:all;">'
                f"{rendered_preview}</div>"
            )
            body = preheader + body

        from_addr = inbox.email
        from_name = inbox.display_name or ""

        # ── Pre-create EmailLog to get an ID for tracking ─────────────────
        from app.send_diagnostics import snapshot_auth_status
        from app.content_risk import score_content
        _send_domain = (from_addr.split("@")[-1] if "@" in from_addr else "")
        _auth_snapshot = await snapshot_auth_status(_send_domain)
        _content_risk = score_content(subject, body)

        email_log_entry = EmailLog(
            lead_id=lead.id,
            campaign_id=campaign.id,
            inbox_id=inbox.id,
            sequence_index=slot.sequence_index,
            variant_id=chosen_variant_id,
            subject=subject,
            format_override=format_override,
            message_id="",
            thread_id=prev_thread_id,
            auth_snapshot=_auth_snapshot,
            content_risk_score=_content_risk["score"],
            content_risk_flags=_content_risk["flags"],
        )
        session.add(email_log_entry)
        await session.flush()

        # ── Inject open/click tracking ────────────────────────────────────
        send_body = body
        link_pairs: list = []
        do_track = is_html and (
            getattr(campaign, "track_opens", False) or getattr(campaign, "track_clicks", False)
        )
        if do_track:
            from app.tracking import inject_tracking_html
            from app.models import TrackedLink as _TrackedLink
            send_body, link_pairs = inject_tracking_html(
                body,
                email_log_entry.id,
                inbox_tracking_base,
                track_opens=getattr(campaign, "track_opens", False),
                track_clicks=getattr(campaign, "track_clicks", False),
                open_token=email_log_entry.open_token,
            )
            for _token, _url in link_pairs:
                session.add(_TrackedLink(email_log_id=email_log_entry.id, token=_token, original_url=_url))

        if getattr(inbox, "beacon_connected", False):
            from app.beacon_client import register_beacon_mappings

            iid = inbox.id
            b_items: list[dict] = [
                {"kind": "unsubscribe", "token": unsub_row.token, "inbox_id": iid}
            ]
            if do_track:
                b_items.insert(0, {"kind": "open", "token": email_log_entry.open_token, "inbox_id": iid})
                for _token, _url in link_pairs:
                    b_items.append(
                        {"kind": "click", "token": _token, "original_url": _url, "inbox_id": iid}
                    )
            try:
                await register_beacon_mappings(inbox, b_items)
            except Exception:
                log.exception(
                    "Beacon register failed for email_log_id=%s; aborting send",
                    email_log_entry.id,
                )
                await session.delete(email_log_entry)
                return

        # ── Append quoted previous email ──────────────────────────────────
        if prev_sent_at and (prev_email_body_html or prev_email_body_plain):
            _from_name = inbox.display_name or inbox.email
            _from_email = inbox.email
            if is_html:
                _prev_html = prev_email_body_html or _plain_to_quoted_html(prev_email_body_plain)
                send_body = send_body + build_quote_html(_prev_html, _from_name, _from_email, prev_sent_at)
            else:
                _prev_plain = prev_email_body_plain or _strip_html_tags(prev_email_body_html)
                if _prev_plain:
                    send_body = send_body + build_quote_plain(_prev_plain, _from_name, _from_email, prev_sent_at)

        list_unsub_url = unsub_url if getattr(campaign, "add_unsubscribe_header", True) else None

        # ── Send ──────────────────────────────────────────────────────────
        if simulate_send:
            fake_thread_id = prev_thread_id or f"test-thread-{email_log_entry.id}"
            result = SendResult(
                message_id=make_msgid(domain="test.local"),
                thread_id=fake_thread_id,
                gmail_message_id=f"test-gmail-{email_log_entry.id}",
            )
        else:
            result = send_email(
                to_email=lead.email,
                subject=subject,
                body=send_body,
                from_email=from_addr,
                from_name=from_name,
                reply_to_msg_id=reply_to_msg_id,
                references=references_chain,
                is_html=is_html,
                provider=inbox.provider or "gmail",
                gmail_access_token=gmail_token,
                gmail_account=ga,
                thread_id=prev_thread_id,
                list_unsubscribe_url=list_unsub_url,
                google_client_id=g_client_id,
                google_client_secret=g_client_secret,
                office365_account=o365_account,
                office365_client_id=o365_client_id,
                office365_client_secret=o365_client_secret,
                office365_tenant_id=o365_tenant_id,
                smtp_host=inbox.smtp_host or "",
                smtp_port=inbox.smtp_port,
                smtp_username=inbox.smtp_username or "",
                smtp_password=inbox.smtp_password or "",
                smtp_encryption=inbox.smtp_encryption or "starttls",
                conversation_id=prev_thread_id if inbox.provider == "office365" else None,
                reply_graph_message_id=reply_graph_message_id if inbox.provider == "office365" else None,
            )

        # ── Permanent failure ─────────────────────────────────────────────
        if isinstance(result, SendFailure):
            log.warning(
                "send_slot_job: permanent failure for lead_id=%s inbox=%s: [%s] %s",
                lead.id, inbox.email, result.error_type, result.message,
            )
            await session.delete(email_log_entry)
            if result.error_type in ("bounce", "invalid_recipient"):
                prev_enr = getattr(cl, "enrollment_status", None) or "active"
                cl.enrollment_status = "bounced"
                cl.bounce_type = result.bounce_type or "hard"
                session.add(BounceEvent(
                    lead_id=lead.id,
                    campaign_id=campaign.id,
                    inbox_id=inbox.id,
                    bounce_type=result.bounce_type or "hard",
                    error_message=result.message,
                ))
                from sqlalchemy import delete as _sql_delete
                await session.execute(
                    _sql_delete(QueueSlot).where(QueueSlot.campaign_lead_id == cl.id)
                )
                await fire_webhook_event(session, "email.bounced", {
                    "lead_id": lead.id, "lead_email": lead.email,
                    "campaign_id": campaign.id, "inbox_id": inbox.id,
                    "error_type": result.error_type, "error_message": result.message, "bounce_type": cl.bounce_type,
                    "timestamp": time_provider.utcnow().isoformat() + "Z",
                })
                await fire_webhook_event(session, "lead.status_changed", {
                    "lead_id": lead.id, "lead_email": lead.email,
                    "campaign_id": campaign.id,
                    "old_enrollment_status": prev_enr, "new_enrollment_status": "bounced",
                    "reason": result.message,
                    "timestamp": time_provider.utcnow().isoformat() + "Z",
                })
            elif result.error_type in ("auth_failed", "permission_denied"):
                await fire_webhook_event(session, "token_expired", {
                    "inbox_id": inbox.id, "inbox_email": inbox.email, "error": result.message,
                })
            await session.commit()
            return

        if not result:
            # Transient failure – roll back the pre-created log; slot stays for retry
            await session.delete(email_log_entry)
            await session.commit()
            log.warning("send_slot_job: transient failure for slot %d, slot retained for retry", slot_id)
            return

        # ── Success ───────────────────────────────────────────────────────
        email_log_entry.message_id = result.message_id
        email_log_entry.thread_id = result.thread_id or prev_thread_id
        await session.delete(slot)
        await _update_enrollment_after_send(session, cl, campaign, sequence)

        if slot.node_id is not None:
            edges_res = await session.execute(select(SequenceEdge).where(SequenceEdge.from_node_id == slot.node_id))
            outgoing_edges = edges_res.scalars().all()
            if outgoing_edges:
                wait_days = max(e.wait_days for e in outgoing_edges)
                if wait_days > 0:
                    cl.node_ready_at = time_provider.utcnow() + timedelta(days=wait_days)
                else:
                    wait_mins = max((e.wait_minutes or 0) for e in outgoing_edges)
                    cl.node_ready_at = time_provider.utcnow() + timedelta(minutes=max(wait_mins, 1))
                log.info(
                    "send_slot_job: tree node %s sent, next evaluation due %s (cl=%s)",
                    slot.node_id, cl.node_ready_at, cl.id,
                )
            else:
                cl.node_ready_at = None
                log.info("send_slot_job: tree node %s sent, no outgoing edges — path ends (cl=%s)", slot.node_id, cl.id)

        if inbox.provider != "office365" and email_log_entry.thread_id:
            try:
                from app.unibox import upsert_sent_message as _upsert_sent_gmail
                await _upsert_sent_gmail(
                    session,
                    inbox_id=inbox.id,
                    thread_id=email_log_entry.thread_id,
                    gmail_message_id=result.gmail_message_id,
                    rfc_message_id=result.message_id,
                    subject=subject,
                    to_email=lead.email,
                    from_email=inbox.email,
                    body=send_body,
                    is_html=is_html,
                )
            except Exception:
                log.exception(
                    "send_slot_job: failed to upsert sent Gmail message "
                    "inbox_id=%s lead=%s", inbox.id, lead.email,
                )

        if inbox.provider == "office365" and email_log_entry.thread_id:
            try:
                from app.unibox import upsert_sent_o365_message
                await upsert_sent_o365_message(
                    session,
                    inbox_id=inbox.id,
                    conversation_id=email_log_entry.thread_id,
                    internet_message_id=result.message_id,
                    subject=subject,
                    to_email=lead.email,
                    from_email=inbox.email,
                    body=send_body,
                    is_html=is_html,
                )
            except Exception:
                log.exception(
                    "send_slot_job: failed to upsert sent O365 message "
                    "inbox_id=%s lead=%s", inbox.id, lead.email,
                )

        await fire_webhook_event(session, "email.sent", {
            "email_log_id": email_log_entry.id,
            "lead_id": lead.id, "lead_email": lead.email,
            "campaign_id": campaign.id, "inbox_id": inbox.id, "inbox_email": inbox.email,
            "subject": subject, "sequence_index": slot.sequence_index,
            "message_id": result.message_id, "thread_id": result.thread_id,
            "timestamp": time_provider.utcnow().isoformat() + "Z",
        })

        # ── Test mode: simulate engagement events ─────────────────────────
        if settings.test_mode:
            from app.models import EmailOpen, EmailClick, TrackedLink as _TL
            fake_ip = f"10.0.{random.randint(0, 255)}.{random.randint(1, 254)}"
            if random.random() < 0.4:
                email_log_entry.opened = True
                session.add(EmailOpen(email_log_id=email_log_entry.id, ip_address=fake_ip))
                await fire_webhook_event(session, "email.opened", {
                    "email_log_id": email_log_entry.id,
                    "lead_id": lead.id, "campaign_id": campaign.id,
                    "ip_address": fake_ip, "timestamp": time_provider.utcnow().isoformat() + "Z",
                })
                if random.random() < 0.5:
                    email_log_entry.clicked = True
                    session.add(EmailClick(
                        email_log_id=email_log_entry.id, ip_address=fake_ip,
                        clicked_at=time_provider.utcnow(),
                    ))
                    await fire_webhook_event(session, "email.clicked", {
                        "email_log_id": email_log_entry.id,
                        "lead_id": lead.id, "campaign_id": campaign.id,
                        "original_url": "https://example.com/test-link",
                        "ip_address": fake_ip, "timestamp": time_provider.utcnow().isoformat() + "Z",
                    })
            if random.random() < 0.15:
                fake_reply = LeadReply(
                    lead_id=lead.id, campaign_id=campaign.id,
                    replied_at=time_provider.utcnow(),
                )
                session.add(fake_reply)
                await session.flush()  # get the assigned id
                await fire_webhook_event(session, "lead.replied", {
                    "lead_id": lead.id, "lead_email": lead.email, "lead_name": lead.name or "",
                    "thread_id": email_log_entry.thread_id or "fake-thread",
                    "inbox_id": inbox.id, "inbox_email": inbox.email,
                    "reply_id": fake_reply.id,
                    "timestamp": time_provider.utcnow().isoformat() + "Z",
                })

        await session.commit()

    last_send_job_run = time_provider.now()
    last_send_job_sent_count += 1
    log.info("send_slot_job: slot %d sent successfully", slot_id)


# ---------------------------------------------------------------------------
# Periodic slot-scan worker – 1 APScheduler job, exact-second asyncio Tasks
# ---------------------------------------------------------------------------

# Tracks slot IDs that already have a live asyncio Task so that two
# consecutive scans overlapping at the 60-second boundary don't double-send.
async def run_slot_scan_job() -> None:
    """1-minute APScheduler job: scans for due slots and enqueues them as arq jobs.

    Each slot is claimed via a Redis distributed lock (SET NX EX) before being
    enqueued. This replaces the old in-process _pending_slot_ids set, making
    dispatch safe across multiple worker replicas — no duplicate sends possible.

    The actual send work (send_slot_job) runs in arq workers, not in the API
    process. The scanner itself stays lightweight and in-process.
    """
    from arq import create_pool
    from app.workers.redis_settings import get_redis_settings
    from app.workers.slot_lock import try_lock_slot

    now = time_provider.utcnow()
    window_end = now + timedelta(seconds=60)

    async with AsyncSessionLocal() as session:
        due_res = await session.execute(
            select(QueueSlot.id, QueueSlot.scheduled_date)
            .where(QueueSlot.scheduled_date <= window_end)
            .order_by(QueueSlot.scheduled_date, QueueSlot.position_in_day)
        )
        rows = due_res.all()

    if not rows:
        return

    redis = await create_pool(get_redis_settings())
    dispatched = 0
    try:
        for slot_id, scheduled_date in rows:
            # Try to acquire distributed lock — skip if another process already claimed it
            if not await try_lock_slot(redis, slot_id):
                continue
            # Enqueue to arq — _job_id dedup prevents re-queuing if already in queue
            delay = max(0.0, (scheduled_date - now).total_seconds())
            await redis.enqueue_job(
                "send_slot",
                slot_id,
                _job_id=f"slot:{slot_id}",
                _defer_by=delay if delay > 0 else None,
            )
            dispatched += 1
    finally:
        await redis.aclose()

    if dispatched:
        log.info(
            "run_slot_scan_job: enqueued %d slot(s) to arq (window %s → +60 s)",
            dispatched, now.isoformat(),
        )



async def run_full_ai_job() -> None:
    """For each active full_ai campaign, draft AI emails for undrafted leads.

    Drafts are stored in FullAIDraft with status='pending' and require human
    approval (via a separate endpoint) before they become sendable. Nothing
    here sends an email or touches CustomEmailOverride/QueueSlot.
    """
    from app.models import Campaign, CampaignLead, Lead, FullAIDraft

    DAILY_CAP_PER_CAMPAIGN = 20

    async with AsyncSessionLocal() as session:
        camp_res = await session.execute(
            select(Campaign).where(
                Campaign.campaign_mode == "full_ai",
                Campaign.paused == False,  # noqa: E712
            )
        )
        campaigns = list(camp_res.scalars().all())

        for campaign in campaigns:
            already_drafted = await session.execute(
                select(FullAIDraft.campaign_lead_id)
                .join(CampaignLead, CampaignLead.id == FullAIDraft.campaign_lead_id)
                .where(CampaignLead.campaign_id == campaign.id)
            )
            drafted_cl_ids = {r[0] for r in already_drafted.all()}

            cl_res = await session.execute(
                select(CampaignLead, Lead)
                .join(Lead, Lead.id == CampaignLead.lead_id)
                .where(
                    CampaignLead.campaign_id == campaign.id,
                    CampaignLead.enrollment_status.in_(["active", "needs_custom_email"]),
                )
                .limit(DAILY_CAP_PER_CAMPAIGN * 3)  # over-fetch, filter drafted below
            )
            candidates = [
                (cl, lead) for cl, lead in cl_res.all()
                if cl.id not in drafted_cl_ids
            ][:DAILY_CAP_PER_CAMPAIGN]

            if not candidates:
                continue

            log.info("run_full_ai_job: campaign=%s drafting %d leads", campaign.id, len(candidates))

            for cl, lead in candidates:
                # Credit gate — check and deduct before AI call
                from app.credits import deduct_credits, get_model_preference, is_bypass_org
                bypass = await is_bypass_org(session, campaign.org_id)
                if not bypass:
                    model = await get_model_preference(session, campaign.org_id)
                    allowed = await deduct_credits(session, campaign.org_id, model)
                    if not allowed:
                        log.warning(
                            "run_full_ai_job: campaign=%s org=%s insufficient credits — skipping lead=%s",
                            campaign.id, campaign.org_id, cl.id,
                        )
                        continue

                custom = lead.custom_data or {}
                result = await generate_personalized_email(
                    session,
                    lead_name=lead.name or "",
                    business_name=custom.get("company", ""),
                    industry=custom.get("industry", ""),
                    website_text=custom.get("website_text", ""),
                )
                if not result or not result.get("subject") or not result.get("body"):
                    log.info("run_full_ai_job: no draft generated for campaign_lead=%s (lead=%s)", cl.id, lead.id)
                    continue

                session.add(FullAIDraft(
                    campaign_lead_id=cl.id,
                    subject=result["subject"],
                    body=result["body"],
                    status="pending",
                ))

            await session.commit()


async def send_reply_email(
    session: AsyncSession,
    lead: "Lead",
    campaign: "Campaign",
    subject: str,
    body: str,
    is_html: bool = False,
) -> "SendResult | SendFailure | None":
    """Send an AI-drafted reply on the existing thread with *lead* for *campaign*.

    Looks up the most recent EmailLog rows for lead+campaign to determine
    which inbox sent the original email and how to thread the reply
    (In-Reply-To, References, Gmail thread_id). Applies the same
    cross-campaign thread-safety check used by send_slot_job's follow-up
    logic: if the Gmail thread is shared with another campaign for this
    lead, the thread_id is cleared rather than risk misthreading.

    Returns None if there is no prior EmailLog to reply on, or if inbox
    send credentials cannot be resolved -- the caller should treat None
    the same as a failure and fall back to draft+notify rather than send.

    Writes an EmailLog row for the outgoing reply (created before sending,
    deleted on failure, filled in with the real message_id/thread_id on
    success) so the reply shows up in analytics/history and can itself be
    threaded off later, same as any other sent email. Flushes but does NOT
    commit -- the caller commits alongside whatever else it needs to save
    (Notification, CampaignLead updates, etc.), same pattern as send_slot_job.

    Does NOT touch Notification/unibox state itself -- that is the caller's
    responsibility, kept separate so this function's job is "send one reply
    correctly and log it", nothing more.
    """
    all_logs_result = await session.execute(
        select(EmailLog).where(
            EmailLog.lead_id == lead.id,
            EmailLog.campaign_id == campaign.id,
            EmailLog.message_id.isnot(None),
            EmailLog.message_id != "",
        ).order_by(EmailLog.sent_at.asc())
    )
    all_logs = all_logs_result.scalars().all()

    if not all_logs:
        log.warning(
            "send_reply_email: no prior EmailLog for lead_id=%s campaign_id=%s, cannot thread reply",
            lead.id, campaign.id,
        )
        return None

    reply_to_msg_id = all_logs[-1].message_id
    references_chain = " ".join(
        (mid if mid.startswith("<") else f"<{mid}>")
        for log_entry in all_logs
        if (mid := log_entry.message_id)
    )
    prev_thread_id = all_logs[-1].thread_id

    if prev_thread_id:
        _cross_camp_row = await session.execute(
            select(EmailLog.id).where(
                EmailLog.lead_id == lead.id,
                EmailLog.thread_id == prev_thread_id,
                EmailLog.campaign_id != campaign.id,
            ).limit(1)
        )
        if _cross_camp_row.scalar_one_or_none():
            log.warning(
                "send_reply_email: thread %s for lead_id=%s shared with another campaign "
                "\u2014 clearing thread_id",
                prev_thread_id, lead.id,
            )
            prev_thread_id = None

    last_inbox_id = all_logs[-1].inbox_id
    if not last_inbox_id:
        log.warning(
            "send_reply_email: last EmailLog for lead_id=%s campaign_id=%s has no inbox_id",
            lead.id, campaign.id,
        )
        return None

    inbox_res = await session.execute(select(Inbox).where(Inbox.id == last_inbox_id))
    inbox = inbox_res.scalar_one_or_none()
    if not inbox:
        log.warning("send_reply_email: inbox %s not found", last_inbox_id)
        return None

    _creds = await resolve_inbox_send_credentials(session, inbox)
    if not _creds["ok"]:
        log.warning(
            "send_reply_email: could not resolve send credentials for inbox %s", inbox.email
        )
        return None

    g_client_id, g_client_secret = await get_google_oauth_credentials(session)
    o365_client_id, o365_client_secret, o365_tenant_id = await get_office365_oauth_credentials(session)

    from app.send_diagnostics import snapshot_auth_status
    from app.content_risk import score_content
    _send_domain = inbox.email.split("@")[-1] if "@" in inbox.email else ""
    _auth_snapshot = await snapshot_auth_status(_send_domain)
    _content_risk = score_content(subject, body)

    email_log_entry = EmailLog(
        lead_id=lead.id,
        campaign_id=campaign.id,
        inbox_id=inbox.id,
        sequence_index=0,
        subject=subject,
        message_id="",
        thread_id=prev_thread_id,
        auth_snapshot=_auth_snapshot,
        content_risk_score=_content_risk["score"],
        content_risk_flags=_content_risk["flags"],
    )
    session.add(email_log_entry)
    await session.flush()

    # Resolve O365 graph message ID for reply threading
    _o365_reply_graph_msg_id = None
    if inbox.provider == "office365" and reply_to_msg_id:
        from app.models import Office365Message as _O365Msg
        _needle = reply_to_msg_id if reply_to_msg_id.startswith("<") else f"<{reply_to_msg_id}>"
        _o365_row = await session.execute(
            select(_O365Msg).where(
                _O365Msg.inbox_id == inbox.id,
                _O365Msg.internet_message_id == _needle,
                ~_O365Msg.message_id.startswith("local-"),
            ).limit(1)
        )
        _o365_msg = _o365_row.scalar_one_or_none()
        if not _o365_msg and prev_thread_id:
            _o365_row2 = await session.execute(
                select(_O365Msg).where(
                    _O365Msg.inbox_id == inbox.id,
                    _O365Msg.conversation_id == prev_thread_id,
                    ~_O365Msg.message_id.startswith("local-"),
                ).order_by(_O365Msg.received_at.desc()).limit(1)
            )
            _o365_msg = _o365_row2.scalar_one_or_none()
        if _o365_msg:
            _o365_reply_graph_msg_id = _o365_msg.message_id
            log.info(
                "send_reply_email: resolved O365 graph message id=%s for lead_id=%s",
                _o365_reply_graph_msg_id, lead.id,
            )

    result = send_email(
        to_email=lead.email,
        subject=subject,
        body=body,
        from_email=inbox.email,
        from_name=inbox.display_name or inbox.email,
        reply_to_msg_id=reply_to_msg_id,
        references=references_chain,
        is_html=is_html,
        provider=inbox.provider or "gmail",
        gmail_access_token=_creds["gmail_token"],
        gmail_account=_creds["ga"],
        thread_id=prev_thread_id,
        list_unsubscribe_url=None,
        google_client_id=g_client_id,
        google_client_secret=g_client_secret,
        office365_account=_creds["o365_account"],
        office365_client_id=o365_client_id,
        office365_client_secret=o365_client_secret,
        office365_tenant_id=o365_tenant_id,
        smtp_host=inbox.smtp_host or "",
        smtp_port=inbox.smtp_port,
        smtp_username=inbox.smtp_username or "",
        smtp_password=inbox.smtp_password or "",
        smtp_encryption=inbox.smtp_encryption or "starttls",
        conversation_id=prev_thread_id if inbox.provider == "office365" else None,
        reply_graph_message_id=_o365_reply_graph_msg_id,
    )

    if isinstance(result, SendFailure):
        log.warning(
            "send_reply_email: permanent send failure for lead_id=%s campaign_id=%s: [%s] %s",
            lead.id, campaign.id, result.error_type, result.message,
        )
        await session.delete(email_log_entry)
        await session.flush()
        return result

    if not result:
        log.warning(
            "send_reply_email: transient send failure for lead_id=%s campaign_id=%s",
            lead.id, campaign.id,
        )
        await session.delete(email_log_entry)
        await session.flush()
        return None

    email_log_entry.message_id = result.message_id
    email_log_entry.thread_id = result.thread_id or prev_thread_id

    log.info(
        "send_reply_email: lead_id=%s campaign_id=%s inbox=%s result=%s",
        lead.id, campaign.id, inbox.email, type(result).__name__ if result else "None",
    )
    return result


async def check_full_ai_auto_send_allowed(
    session: AsyncSession,
    reply_text: str,
    campaign_id: int,
) -> tuple[bool, str]:
    """Decide whether a Full AI reply should be auto-sent or fall back to
    draft+notify for human review.

    Pure decision logic, no email is sent here -- the caller is responsible
    for actually calling send_reply_email if this returns (True, "").

    Returns (allowed, reason). ``allowed=False`` always comes with a short
    human-readable ``reason`` string suitable for a log line; ``allowed=True``
    returns an empty reason.

    Checks, in order:
      1. The "full_ai_auto_send_enabled" setting (off by default).
      2. reply_needs_human_review(reply_text) -- ambiguous/risky keywords.
      3. The per-campaign daily cap ("full_ai_daily_reply_cap" setting,
         default 20), counted against Notification rows with
         event_type="ai_reply_sent" and campaign_id=campaign_id created
         today.
    """
    from app.ai_classifier import reply_needs_human_review
    from app.models import AppSetting, Notification

    settings_res = await session.execute(
        select(AppSetting).where(AppSetting.key.in_(
            ["full_ai_auto_send_enabled", "full_ai_daily_reply_cap"]
        ))
    )
    settings_map = {r.key: r.value for r in settings_res.scalars().all()}
    auto_send_on = settings_map.get("full_ai_auto_send_enabled", "false").lower() == "true"

    if not auto_send_on:
        return False, "auto-send disabled in settings"

    if reply_needs_human_review(reply_text):
        return False, "reply contains a keyword requiring human review"

    daily_cap = int(settings_map.get("full_ai_daily_reply_cap", "20") or 20)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    sent_today_res = await session.execute(
        select(func.count(Notification.id)).where(
            Notification.event_type == "ai_reply_sent",
            Notification.campaign_id == campaign_id,
            Notification.created_at >= today_start,
        )
    )
    sent_today = sent_today_res.scalar() or 0
    if sent_today >= daily_cap:
        return False, f"daily reply cap ({daily_cap}) reached for this campaign"

    return True, ""


async def run_tree_transition_job():
    """Wrapper called by the arq worker to evaluate branch-tree transitions."""
    from app.queue_logic import evaluate_tree_transitions
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        transitioned = await evaluate_tree_transitions(session)
        await session.commit()
        log.info("run_tree_transition_job: transitioned=%d", transitioned)
