"""Emissary pricing plan definitions — single source of truth.

Maps our internal plan/period identifiers to the Stripe Price IDs configured
in settings (via environment variables). Also carries the plan metadata used
by the frontend billing page — display prices, and the limits that will be
enforced once usage-metering is built (not yet implemented; see Subscription
model docstring).
"""
from __future__ import annotations

from app.settings_manager import settings

PLAN_IDS = ["starter", "growth", "scale", "agency"]
PERIODS = ["monthly", "annual"]

PLAN_DISPLAY = {
    "starter": {
        "label": "Starter",
        "price_monthly": 29,
        "price_annual": 23,  # per month, billed annually (20% off)
        "limits": {"inboxes": 2, "emails_per_month": 5000, "active_leads": 1000,
                   "placement_radar_tests_per_month": 5, "ai_personalizations_per_month": 500,
                   "api_access": False, "white_label": False},
    },
    "growth": {
        "label": "Growth",
        "price_monthly": 79,
        "price_annual": 63,
        "limits": {"inboxes": 10, "emails_per_month": 30000, "active_leads": 10000,
                   "placement_radar_tests_per_month": 50, "ai_personalizations_per_month": 5000,
                   "api_access": True, "white_label": False},
    },
    "scale": {
        "label": "Scale",
        "price_monthly": 179,
        "price_annual": 143,
        "limits": {"inboxes": 30, "emails_per_month": 150000, "active_leads": 50000,
                   "placement_radar_tests_per_month": None, "ai_personalizations_per_month": 25000,
                   "api_access": True, "white_label": False},
    },
    "agency": {
        "label": "Agency",
        "price_monthly": 259,
        "price_annual": 207,
        "limits": {"inboxes": None, "emails_per_month": 500000, "active_leads": None,
                   "placement_radar_tests_per_month": None, "ai_personalizations_per_month": None,
                   "api_access": True, "white_label": True},
    },
}
# None in a limit means "unlimited" for that plan.

# ---------------------------------------------------------------------------
# AI Credit packs (one-time purchases)
# ---------------------------------------------------------------------------
CREDIT_PACKS = [
    {"id": "credits_100",  "credits": 100,  "price_usd": 5,  "label": "100 AI Credits  — $5"},
    {"id": "credits_500",  "credits": 500,  "price_usd": 20, "label": "500 AI Credits  — $20"},
    {"id": "credits_1000", "credits": 1000, "price_usd": 35, "label": "1000 AI Credits — $35"},
]


def get_credit_pack(pack_id: str) -> dict | None:
    """Return a credit pack dict by id, or None if not found."""
    return next((p for p in CREDIT_PACKS if p["id"] == pack_id), None)


def get_credit_pack_price_id(pack_id: str) -> str:
    """Return Stripe Price ID for a credit pack from settings, or empty string."""
    key = f"stripe_price_{pack_id}"
    return getattr(settings, key, "") or ""


def get_price_id(plan: str, period: str) -> str:
    """Return the Stripe Price ID for a given plan+period, or '' if unconfigured."""
    key = f"stripe_price_{plan}_{period}"
    return getattr(settings, key, "") or ""


def get_all_plans_for_frontend() -> list[dict]:
    """Return plan metadata for the billing page — no Stripe IDs exposed to the client."""
    return [
        {"id": plan_id, **PLAN_DISPLAY[plan_id]}
        for plan_id in PLAN_IDS
    ]
