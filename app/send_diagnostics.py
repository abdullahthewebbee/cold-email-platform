"""Send-time authentication snapshot for Send Autopsy.

Snapshots the SENDING DOMAIN's SPF/DMARC configuration at the moment of
send (cached briefly per domain, since DNS records rarely change and we
don't want a DNS lookup blocking every single send). This tells you whether
your domain was correctly configured when an email went out — it is NOT
the recipient's actual authentication verdict (that requires delayed DMARC
aggregate reports, which most providers don't expose per-email).

DKIM is intentionally not included here: DKIM selectors are provider-specific
and not stored per-inbox, so per-send DKIM checking isn't reliable without
extra configuration. Use DNS Doctor for a full DKIM check.
"""
from __future__ import annotations

import logging
import time as _time

log = logging.getLogger("quickly.send_diagnostics")

_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours
_cache: dict[str, tuple[float, dict]] = {}


async def snapshot_auth_status(domain: str) -> dict:
    """Return a cached-or-fresh SPF/DMARC snapshot for *domain*.

    Returns {"spf_status": "pass"|"fail"|"warning"|"unknown",
             "dmarc_policy": "reject"|"quarantine"|"none"|"missing"|"unknown",
             "checked_at": iso timestamp or None}
    """
    domain = (domain or "").strip().lower()
    if not domain:
        return {"spf_status": "unknown", "dmarc_policy": "unknown", "checked_at": None}

    now = _time.time()
    cached = _cache.get(domain)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    result = await _fetch_fresh_snapshot(domain)
    _cache[domain] = (now, result)
    return result


async def _fetch_fresh_snapshot(domain: str) -> dict:
    from datetime import datetime, timezone
    try:
        import checkdmarc
        cd = checkdmarc.check_domains([domain], include_tag_descriptions=False, timeout=5)
    except Exception as e:
        log.warning("snapshot_auth_status: checkdmarc failed for %s: %s", domain, e)
        cd = None

    spf_status = "unknown"
    dmarc_policy = "unknown"

    if cd:
        spf = cd.get("spf", {})
        if spf.get("record"):
            all_qualifier = (spf.get("parsed") or {}).get("all")
            lookups = spf.get("dns_lookups", 0)
            if not spf.get("valid", True) or all_qualifier == "pass" or lookups > 10:
                spf_status = "fail"
            elif lookups >= 8:
                spf_status = "warning"
            else:
                spf_status = "pass"
        else:
            spf_status = "fail"

        dmarc = cd.get("dmarc", {})
        if dmarc.get("record"):
            dmarc_policy = (dmarc.get("tags") or {}).get("p", {}).get("value", "none")
        else:
            dmarc_policy = "missing"

    return {
        "spf_status": spf_status,
        "dmarc_policy": dmarc_policy,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }