"""AI feature modules for Quickly.

Each AI feature is independent — it has its own provider, model, and API key.
Settings are stored in the ``app_setting`` table under keys prefixed with
``ai_{feature_id}_``:

* ``ai_{feature_id}_enabled``   – "true" / "false"
* ``ai_{feature_id}_provider``  – e.g. "openai", "anthropic", "mistral", "groq"
* ``ai_{feature_id}_model``     – e.g. "gpt-4o", "claude-sonnet-4-20250514"
* ``ai_{feature_id}_api_key``   – the provider's API key

Currently defined features
--------------------------
reply_classifier
    Classifies a lead's reply as "interested" or "not_interested" using the
    full context of the original email sent plus the lead's reply text.
"""
from __future__ import annotations

import logging
from typing import Literal

from any_llm import LLMProvider, acompletion, alist_models
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting

log = logging.getLogger("quickly.ai_classifier")


# ── Feature registry ─────────────────────────────────────────────────────────

FEATURES: dict[str, dict] = {
    "reply_classifier": {
        "label": "Reply Interest Classifier",
        "description": (
            "Classifies lead replies as 'interested', 'not_interested', 'unsubscribed', "
            "'out_of_office', 'wrong_person', or 'auto_reply' based on "
            "the original email sent and the lead's reply. Unsubscribe and wrong-person "
            "results set per-campaign enrollment and clear remaining queue slots; "
            "not_interested and out_of_office set interest and clear slots; auto_reply "
            "only sets interest."
        ),
    },
    "reply_draft_assistant": {
        "label": "AI Reply Draft Assistant",
        "description": (
            "Drafts a suggested reply to a lead's message using the full email/reply "
            "context. The draft appears in the Unibox for review — it is never sent "
            "automatically."
        ),
    },
    "deep_personalization": {
        "label": "Deep Personalization Engine",
        "description": (
            "Scrapes a lead's website and uses it, plus the lead's info, to write a "
            "personalized subject/body for a personalized-sequence step. Generated "
            "content is a draft — you review and save it, nothing is sent automatically."
        ),
    },
    "sequence_generator": {
        "label": "AI Sequence Generator",
        "description": (
            "Generates a full cold-email sequence (steps, subjects, bodies, and branch "
            "tree connections) from a one-line goal description. Output is a draft -- "
            "review and edit before activating the campaign."
        ),
    },
}


# ── Provider helpers ──────────────────────────────────────────────────────────

def get_supported_providers() -> list[dict[str, str]]:
    """Return a list of all supported AI providers, most popular first.

    Each entry is ``{"value": "<enum_value>", "label": "<display_name>"}``.
    Popular providers are pinned to the top; the rest follow alphabetically.
    """
    _LABELS: dict[str, str] = {
        "openai": "OpenAI",
        "anthropic": "Anthropic",
        "gemini": "Google (Gemini)",
        "mistral": "Mistral",
        "groq": "Groq",
        "cohere": "Cohere",
        "together": "Together AI",
        "deepseek": "DeepSeek",
        "openrouter": "OpenRouter",
        "perplexity": "Perplexity",
        "xai": "xAI (Grok)",
        "ollama": "Ollama (Local)",
        "bedrock": "AWS Bedrock",
        "azure": "Azure OpenAI",
        "fireworks": "Fireworks AI",
        "sambanova": "SambaNova",
        "cerebras": "Cerebras",
        "huggingface": "Hugging Face",
        "vertexai": "Vertex AI",
    }
    _TOP = [
        "openai", "anthropic", "gemini", "mistral", "groq", "cohere",
        "together", "deepseek", "openrouter", "perplexity", "xai",
    ]

    all_values = {p.value for p in LLMProvider}
    result: list[dict[str, str]] = []

    for v in _TOP:
        if v in all_values:
            result.append({"value": v, "label": _LABELS.get(v, v.title())})

    remaining = sorted(all_values - {p["value"] for p in result})
    for v in remaining:
        result.append({"value": v, "label": _LABELS.get(v, v.title())})

    return result


async def get_models_for_provider(provider: str, api_key: str) -> list[dict[str, str]]:
    """Fetch models for a given provider using the provider's API.

    Returns a list of ``{"id": "...", "name": "..."}`` dicts.
    Raises on failure so the caller can return an appropriate error.
    """
    models = await alist_models(provider, api_key=api_key)
    return [{"id": m.id, "name": getattr(m, "name", m.id) or m.id} for m in models]


# ── Per-feature setting helpers ───────────────────────────────────────────────

async def _get_feature_settings(db: AsyncSession, feature_id: str) -> dict[str, str]:
    """Load all settings for *feature_id* from the DB.

    Returns a flat dict with the ``ai_{feature_id}_`` prefix stripped off,
    e.g. ``{"enabled": "true", "provider": "openai", ...}``.
    """
    prefix = f"ai_{feature_id}_"
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.like(f"{prefix}%"))
    )
    rows = result.scalars().all()
    return {r.key[len(prefix):]: r.value for r in rows}


async def is_feature_enabled(db: AsyncSession, feature_id: str) -> bool:
    """Return True if *feature_id* is fully configured and enabled."""
    settings = await _get_feature_settings(db, feature_id)
    return (
        settings.get("enabled", "false").lower() in ("true", "1", "yes")
        and bool(settings.get("provider"))
        and bool(settings.get("model"))
        and bool(settings.get("api_key"))
    )


async def is_ai_enabled(db: AsyncSession) -> bool:
    """Backward-compatible alias — checks the reply_classifier feature."""
    return await is_feature_enabled(db, "reply_classifier")


# ── Model capability helpers ─────────────────────────────────────────────────

async def _model_supports_temperature(
    db: AsyncSession, provider: str, model: str
) -> bool:
    """Check whether we know the model cannot handle a temperature arg.

    Returns False if we've previously recorded that the model does *not*
    support appearing temperature (i.e. we should omit it).  True otherwise.
    """
    key = f"ai_model_{provider}_{model}_no_temperature"
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    return result.scalars().first() is None


async def _mark_model_no_temperature(
    db: AsyncSession, provider: str, model: str
) -> None:
    """Persist a flag indicating the given provider+model don't support temperature."""
    from app.settings_manager import save_setting_to_db

    key = f"ai_model_{provider}_{model}_no_temperature"
    # value doesn't matter, just store a truthy string
    await save_setting_to_db(db, key, "1")
    await db.commit()


async def _completion_with_temperature_handling(
    db: AsyncSession,
    provider: str,
    model: str,
    api_key: str,
    **kwargs,
):
    """Wrapper around ``acompletion`` that omits temperature if unsupported.

    If the initial call fails with a "temperature unsupported" error we
    mark the model accordingly and retry without the setting.
    """
    # choose whether to include temperature
    include_temp = True
    if "temperature" in kwargs:
        include_temp = await _model_supports_temperature(db, provider, model)
        if not include_temp:
            kwargs.pop("temperature", None)

    try:
        return await acompletion(
            provider=provider, model=model, api_key=api_key, **kwargs
        )
    except Exception as exc:
        msg = str(exc).lower()
        if "temperature" in msg and ("unsupported" in msg or "does not support" in msg):
            # record exclusion and retry once without temperature
            await _mark_model_no_temperature(db, provider, model)
            if "temperature" in kwargs:
                kwargs.pop("temperature", None)
            return await acompletion(
                provider=provider, model=model, api_key=api_key, **kwargs
            )
        raise


# ── Reply Classifier ──────────────────────────────────────────────────────────

_REPLY_CLASSIFIER_SYSTEM_PROMPT = """\
You are an email reply classifier for a cold-email outreach tool.

You will be given the conversation thread (original email + any follow-ups) with
timestamps, followed by the lead's latest reply.  Using all of this context,
classify the lead's reply as one of:

  - "interested"     — the lead shows positive engagement: wants more info,
                       schedules a call, asks questions about the offer, etc.
  - "not_interested" — the lead declines or gives a negative/neutral response
                       with no intent to engage, but does NOT explicitly ask to
                       be removed from mailings.
  - "unsubscribed"   — the lead explicitly requests to be removed, unsubscribed,
                       or asks to stop receiving emails (e.g. "unsubscribe",
                       "remove me", "stop emailing me", "take me off your list").
  - "out_of_office"  — the reply is an automatic out-of-office/vacation autoresponder.
  - "wrong_person"   — the lead indicates they are not the right contact (e.g.
                       "you have the wrong person", "I don't handle this", etc.).
  - "auto_reply"     — the reply is a generic automated acknowledgement that is NOT
                       an out-of-office (e.g. ticket confirmation, CRM auto-reply).

Respond with ONLY one of these exact values:
  interested  |  not_interested  |  unsubscribed  |  out_of_office  |  wrong_person  |  auto_reply
Do NOT include any other text, explanation, or punctuation.
"""


async def classify_reply(
    db: AsyncSession,
    reply_text: str,
    email_subject: str = "",
    email_body: str = "",
    thread_messages: list[dict] | None = None,
) -> Literal["interested", "not_interested", "unsubscribed", "out_of_office", "wrong_person", "auto_reply"] | None:
    """Classify *reply_text* using the reply_classifier feature.

    Accepts the original *email_subject* and *email_body* for basic context, or
    a richer *thread_messages* list (``[{"from": ..., "timestamp": ...,
    "body": ...}, ...]``) to include the full conversation thread with timestamps.

    Returns ``None`` if the feature is disabled, settings are incomplete, or the
    provider call fails.  The caller must handle ``None`` gracefully.
    """
    settings = await _get_feature_settings(db, "reply_classifier")
    enabled = settings.get("enabled", "false").lower() in ("true", "1", "yes")
    provider = settings.get("provider", "")
    model = settings.get("model", "")
    api_key = settings.get("api_key", "")

    if not (enabled and provider and model and api_key):
        return None

    # Build user message — prefer full thread context when available
    parts: list[str] = []
    if thread_messages:
        parts.append("=== CONVERSATION THREAD ===")
        for msg in thread_messages:
            ts = msg.get("timestamp", "")
            frm = msg.get("from", "")
            body = (msg.get("body") or "")[:1500]
            header = f"[{ts}] {frm}" if ts else frm
            parts.append(f"--- {header} ---")
            parts.append(body)
            parts.append("")
    elif email_subject or email_body:
        parts.append("=== ORIGINAL EMAIL SENT ===")
        if email_subject:
            parts.append(f"Subject: {email_subject}")
        if email_body:
            parts.append(email_body[:2000])
        parts.append("")

    parts.append("=== LEAD'S LATEST REPLY ===")
    parts.append(reply_text[:4000])
    user_content = "\n".join(parts)

    try:
        response = await _completion_with_temperature_handling(
            db=db,
            provider=provider,
            model=model,
            api_key=api_key,
            messages=[
                {"role": "system", "content": _REPLY_CLASSIFIER_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0,
        )
        raw = response.choices[0].message.content.strip().lower()
        # Check in order: multi-word values first to avoid substring collisions
        if "not_interested" in raw:
            return "not_interested"
        if "unsubscribed" in raw:
            return "unsubscribed"
        if "out_of_office" in raw:
            return "out_of_office"
        if "wrong_person" in raw:
            return "wrong_person"
        if "auto_reply" in raw:
            return "auto_reply"
        if "interested" in raw:
            return "interested"
        log.warning(
            "AI reply classifier returned unexpected output "
            "(provider=%s model=%s): %r",
            provider, model, raw,
        )
        return None
    except Exception as exc:
        log.warning(
            "AI reply classification failed (provider=%s model=%s): %s: %s",
            provider, model, type(exc).__name__, exc,
        )
        # Record failure for health monitoring and fire alert event
        try:
            from app.settings_manager import save_setting_to_db
            from app import time as _time
            err_msg = f"{type(exc).__name__}: {exc}"[:500]
            await save_setting_to_db(db, "ai_reply_classifier_last_error", err_msg)
            await save_setting_to_db(db, "ai_reply_classifier_last_error_at", _time.utcnow().isoformat() + "Z")
            await db.commit()
            from app.webhooks import fire_webhook_event
            await fire_webhook_event(db, "feature.error", {
                "feature": "ai_reply_classifier",
                "label": "Reply Interest Classifier",
                "error": err_msg,
            })
        except Exception:
            pass
        return None


# ── AI Reply Draft Assistant ────────────────────────────────────────────────

_REPLY_DRAFT_SYSTEM_PROMPT = """You write draft email replies for a sales rep responding to a lead's message.

Rules:
- Write ONLY the reply body text. No subject line, no explanations, no meta-commentary.
- Match a professional but warm, human tone — not robotic, not overly formal.
- Keep it concise: a few short sentences, not a wall of text.
- Directly address what the lead said or asked.
- Do not invent specific facts, prices, dates, or commitments that weren't in the provided context.
- Do not include a greeting salutation like "Hi [Name]," or a sign-off like "Best," — the rep will add those themselves.
"""


# Keywords that suggest a reply needs human review before an AI-drafted
# response is auto-sent, even when classified as "interested". This is a
# blunt, deliberately conservative heuristic (not AI-based) so it has no
# dependency on the AI provider being configured or reachable.
_AMBIGUOUS_REPLY_KEYWORDS = [
    "refund", "lawyer", "legal", "attorney", "sue", "lawsuit",
    "complaint", "complain", "cancel my", "cancel this",
    "unsubscribe", "gdpr", "data request", "delete my data",
    "price", "pricing", "discount", "negotiate", "contract",
    "invoice", "chargeback", "fraud", "scam",
]


def reply_needs_human_review(reply_text: str) -> bool:
    """Return True if *reply_text* contains a keyword suggesting the reply
    should not be auto-sent without a human reviewing it first.

    Deliberately simple substring matching, not AI-based, so it works even
    when the AI provider is unavailable and never blocks on an API call.
    """
    if not reply_text:
        return False
    lowered = reply_text.lower()
    return any(kw in lowered for kw in _AMBIGUOUS_REPLY_KEYWORDS)


# Keywords that suggest a reply needs human review before an AI-drafted
# response is auto-sent, even when classified as "interested". This is a
# blunt, deliberately conservative heuristic (not AI-based) so it has no
# dependency on the AI provider being configured or reachable.
_AMBIGUOUS_REPLY_KEYWORDS = [
    "refund", "lawyer", "legal", "attorney", "sue", "lawsuit",
    "complaint", "complain", "cancel my", "cancel this",
    "unsubscribe", "gdpr", "data request", "delete my data",
    "price", "pricing", "discount", "negotiate", "contract",
    "invoice", "chargeback", "fraud", "scam",
]


def reply_needs_human_review(reply_text: str) -> bool:
    """Return True if *reply_text* contains a keyword suggesting the reply
    should not be auto-sent without a human reviewing it first.

    Deliberately simple substring matching, not AI-based, so it works even
    when the AI provider is unavailable and never blocks on an API call.
    """
    if not reply_text:
        return False
    lowered = reply_text.lower()
    return any(kw in lowered for kw in _AMBIGUOUS_REPLY_KEYWORDS)


async def draft_reply(
    db: AsyncSession,
    reply_text: str,
    email_subject: str = "",
    email_body: str = "",
    thread_messages: list[dict] | None = None,
) -> str | None:
    """Draft a suggested reply to *reply_text* using the reply_draft_assistant feature.

    Same context pattern as classify_reply — accepts either basic (subject, body)
    context or a richer thread_messages list.

    Returns None if the feature is disabled, settings are incomplete, or the
    provider call fails. The caller must handle None gracefully (e.g. hide the
    "AI draft" button, or show an error).
    """
    settings = await _get_feature_settings(db, "reply_draft_assistant")
    enabled = settings.get("enabled", "false").lower() in ("true", "1", "yes")
    provider = settings.get("provider", "")
    model = settings.get("model", "")
    api_key = settings.get("api_key", "")

    if not (enabled and provider and model and api_key):
        return None

    parts: list[str] = []
    if thread_messages:
        parts.append("=== CONVERSATION THREAD ===")
        for msg in thread_messages:
            ts = msg.get("timestamp", "")
            frm = msg.get("from", "")
            body = (msg.get("body") or "")[:1500]
            header = f"[{ts}] {frm}" if ts else frm
            parts.append(f"--- {header} ---")
            parts.append(body)
            parts.append("")
    elif email_subject or email_body:
        parts.append("=== ORIGINAL EMAIL SENT ===")
        if email_subject:
            parts.append(f"Subject: {email_subject}")
        if email_body:
            parts.append(email_body[:2000])
        parts.append("")

    parts.append("=== LEAD'S LATEST MESSAGE (reply to this) ===")
    parts.append(reply_text[:4000])
    user_content = "\n".join(parts)

    try:
        response = await _completion_with_temperature_handling(
            db=db,
            provider=provider,
            model=model,
            api_key=api_key,
            messages=[
                {"role": "system", "content": _REPLY_DRAFT_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
        )
        draft = response.choices[0].message.content.strip()
        return draft or None
    except Exception as exc:
        log.warning("draft_reply: provider call failed: %s", exc)
        return None


# ── Deep Personalization Engine ─────────────────────────────────────────────

_PERSONALIZATION_SYSTEM_PROMPT = """You write a single personalized cold outreach email for a sales rep.

You will be given information about a lead (name, company, industry) and text scraped from
their company website. Use this to write ONE genuinely specific, relevant opening/body that
references something real about their business — not a generic template.

Rules:
- Output EXACTLY in this format, nothing else:
SUBJECT: <subject line>
BODY:
<email body>
- Keep the body short: 3-5 sentences.
- Reference something specific and real from the website content provided — avoid generic
  filler like "I noticed your company does great work."
- Do not invent facts not present in the provided website content.
- Tone: professional, warm, human — not salesy or robotic.
- Do not include a greeting salutation or sign-off — the rep will add those.
"""


async def generate_personalized_email(
    db: AsyncSession,
    lead_name: str = "",
    business_name: str = "",
    industry: str = "",
    website_text: str = "",
    style_hint: str = "",
) -> dict[str, str] | None:
    """Generate a personalized subject/body using the deep_personalization feature.

    Returns {"subject": str, "body": str} or None if the feature is disabled,
    settings are incomplete, the provider call fails, or the response couldn't
    be parsed.
    """
    settings = await _get_feature_settings(db, "deep_personalization")
    enabled = settings.get("enabled", "false").lower() in ("true", "1", "yes")
    provider = settings.get("provider", "")
    model = settings.get("model", "")
    api_key = settings.get("api_key", "")

    if not (enabled and provider and model and api_key):
        return None

    parts: list[str] = ["=== LEAD INFO ==="]
    if lead_name:
        parts.append(f"Name: {lead_name}")
    if business_name:
        parts.append(f"Company: {business_name}")
    if industry:
        parts.append(f"Industry: {industry}")
    parts.append("")
    if website_text:
        parts.append("=== COMPANY WEBSITE CONTENT ===")
        parts.append(website_text)
        parts.append("")
    if style_hint:
        parts.append("=== STYLE/TONE REFERENCE (match this style) ===")
        parts.append(style_hint[:1000])

    user_content = "\n".join(parts)

    try:
        response = await _completion_with_temperature_handling(
            db=db,
            provider=provider,
            model=model,
            api_key=api_key,
            messages=[
                {"role": "system", "content": _PERSONALIZATION_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
    except Exception as exc:
        log.warning("generate_personalized_email: provider call failed: %s", exc)
        return None

    subject = ""
    body = raw
    if raw.upper().startswith("SUBJECT:"):
        lines = raw.split("\n")
        subject = lines[0][len("SUBJECT:"):].strip()
        rest = "\n".join(lines[1:]).strip()
        if rest.upper().startswith("BODY:"):
            rest = rest[len("BODY:"):].strip()
        body = rest

    if not body.strip():
        return None
    return {"subject": subject, "body": body}


# ── Credential verification ───────────────────────────────────────────────────

_SEQUENCE_SYSTEM_PROMPT = """You are an expert cold-email copywriter. Given a goal, generate a cold-email sequence as JSON.
Return ONLY valid JSON with this exact structure:
{
  "steps": [
    {
      "label": "Step name",
      "subject": "Email subject line",
      "body": "Email body in HTML",
      "is_html": true,
      "wait_days": 0,
      "condition": "always"
    }
  ],
  "edges": [
    {"from": 0, "to": 1, "condition": "opened", "wait_days": 2}
  ]
}
conditions: always, opened, not_opened, replied, clicked, not_clicked
Use {{name}}, {{business_name}}, {{industry}} placeholders. Keep emails concise and professional.
Return ONLY the JSON object, no markdown, no explanation."""


async def generate_sequence(
    db: AsyncSession,
    goal: str,
    num_steps: int = 3,
) -> dict | None:
    """Generate a full sequence from a goal description using the sequence_generator feature."""
    settings = await _get_feature_settings(db, "sequence_generator")
    enabled = settings.get("enabled", "false").lower() in ("true", "1", "yes")
    provider = settings.get("provider", "")
    model = settings.get("model", "")
    api_key = settings.get("api_key", "")
    if not (enabled and provider and model and api_key):
        return None
    user_content = f"Goal: {goal}\nNumber of steps: {num_steps}\nGenerate the sequence JSON now."
    try:
        response = await _completion_with_temperature_handling(
            db=db, provider=provider, model=model, api_key=api_key,
            messages=[
                {"role": "system", "content": _SEQUENCE_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        import json
        return json.loads(raw.strip())
    except Exception as exc:
        log.warning("generate_sequence: failed: %s", exc)
        return None



async def verify_ai_key(
    provider: str,
    model: str,
    api_key: str,
) -> dict:
    """Send a trivial prompt to verify that the given credentials are valid.

    Returns ``{"ok": True}`` on success or ``{"ok": False, "error": "..."}``
    on failure.
    """
    try:
        response = await acompletion(
            model=model,
            provider=provider,
            api_key=api_key,
            messages=[{"role": "user", "content": "Say 'Hello'"}],
        )
        text = response.choices[0].message.content.strip()
        log.info("AI credential verification succeeded (provider=%s, model=%s)", provider, model)
        if text:
            return {"ok": True}
        return {"ok": False, "error": "Empty response from model"}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
