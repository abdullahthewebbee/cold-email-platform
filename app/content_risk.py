"""Rule-based content risk scoring for outgoing cold emails.

Shared by Send Autopsy (post-send diagnostic) and Spam Score Pre-Check
(pre-send warning in the editor) — one scoring function, two call sites.

This is intentionally rule-based, not ML-based, per the blueprint's own
phased plan: ship rule-based now, swap in a trained model later once there's
enough real send data to train on.
"""
from __future__ import annotations

import re

# (phrase, weight) — higher weight = stronger spam signal.
# Phrases are matched case-insensitively as substrings.
_SPAM_PHRASES: list[tuple[str, int]] = [
    ("100% free", 10), ("act now", 8), ("apply now", 5), ("buy now", 8),
    ("cash bonus", 10), ("click here", 8), ("congratulations", 6),
    ("dear friend", 8), ("earn money", 8), ("free gift", 9), ("free money", 10),
    ("free trial", 4), ("get paid", 7), ("guaranteed", 6), ("limited time", 6),
    ("lowest price", 6), ("no cost", 6), ("no obligation", 6), ("no purchase necessary", 8),
    ("order now", 8), ("risk free", 7), ("satisfaction guaranteed", 5),
    ("this is not spam", 10), ("unsubscribe", 3), ("winner", 6), ("you have been selected", 9),
    ("act immediately", 8), ("urgent", 5), ("as seen on", 6), ("special promotion", 6),
    ("cancel at any time", 5), ("credit card required", 8), ("double your", 8),
    ("increase sales", 5), ("million dollars", 9), ("once in a lifetime", 7),
    ("what are you waiting for", 6), ("why pay more", 6), ("work from home", 7),
]

_MAX_SCORE = 100


def score_content(subject: str = "", body: str = "") -> dict:
    """Score outgoing email content for spam-trigger risk.

    Returns {"score": 0-100, "flags": [{"phrase": str, "weight": int}, ...],
    "risk_level": "low"|"medium"|"high"}. Higher score = higher risk.
    """
    text = f"{subject or ''}\n{body or ''}".lower()
    flags: list[dict] = []
    total = 0

    for phrase, weight in _SPAM_PHRASES:
        if phrase in text:
            flags.append({"phrase": phrase, "weight": weight})
            total += weight

    # Extra signals beyond the phrase list
    if subject and subject.strip() == subject.strip().upper() and len(subject.strip()) > 3:
        flags.append({"phrase": "ALL-CAPS subject line", "weight": 10})
        total += 10

    exclamations = (subject or "").count("!") + (body or "").count("!")
    if exclamations >= 3:
        flags.append({"phrase": f"{exclamations} exclamation marks", "weight": 5})
        total += 5

    dollar_signs = len(re.findall(r"\$\d", f"{subject or ''} {body or ''}"))
    if dollar_signs >= 2:
        flags.append({"phrase": f"{dollar_signs} dollar-amount mentions", "weight": 4})
        total += 4

    score = min(_MAX_SCORE, total)
    if score >= 40:
        risk_level = "high"
    elif score >= 15:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {"score": score, "flags": flags, "risk_level": risk_level}