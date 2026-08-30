"""DNS Doctor: checks SPF, DKIM, and DMARC records for a domain and returns
pass/fail status plus the exact record text needed to fix any gaps.
"""
from __future__ import annotations

import logging

import dns.resolver
from fastapi import APIRouter, HTTPException, Query

log = logging.getLogger("emissary.dns_doctor")

router = APIRouter(prefix="/api/dns-doctor", tags=["dns-doctor"])

COMMON_DKIM_SELECTORS = ["google", "default", "selector1", "selector2", "k1", "mail"]
BLACKLIST_ZONES = [
    ("zen.spamhaus.org", "Spamhaus"),
    ("b.barracudacentral.org", "Barracuda"),
    ("dnsbl.sorbs.net", "SORBS"),
]


def _resolve_a_record(domain: str) -> str | None:
    try:
        answers = dns.resolver.resolve(domain, "A", lifetime=5)
        return str(answers[0])
    except Exception:
        return None


def _check_blacklists(domain: str) -> dict:
    ip = _resolve_a_record(domain)
    if not ip:
        return {
            "status": "warning",
            "ip": None,
            "listed_on": [],
            "message": "Could not resolve an A record for this domain to check blacklists.",
        }

    reversed_ip = ".".join(reversed(ip.split(".")))
    listed_on = []
    for zone, label in BLACKLIST_ZONES:
        query = f"{reversed_ip}.{zone}"
        try:
            dns.resolver.resolve(query, "A", lifetime=5)
            listed_on.append(label)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
            pass
        except Exception as e:
            log.warning("Blacklist query failed for %s: %s", query, e)

    if listed_on:
        return {
            "status": "fail",
            "ip": ip,
            "listed_on": listed_on,
            "message": f"IP {ip} is listed on: {', '.join(listed_on)}. This will hurt deliverability — request delisting from each provider.",
        }
    return {
        "status": "pass",
        "ip": ip,
        "listed_on": [],
        "message": None,
    }
def _query_txt(name: str) -> list[str]:
    """Return all TXT record strings for a DNS name, or empty list if none found."""
    try:
        answers = dns.resolver.resolve(name, "TXT", lifetime=5)
        records = []
        for rdata in answers:
            txt = b"".join(rdata.strings).decode("utf-8", errors="ignore")
            records.append(txt)
        return records
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return []
    except Exception as e:
        log.warning("DNS query failed for %s: %s", name, e)
        return []


def _check_spf(domain: str) -> dict:
    records = _query_txt(domain)
    spf_records = [r for r in records if r.strip().lower().startswith("v=spf1")]
    if not spf_records:
        return {
            "status": "fail",
            "record": None,
            "suggested_record": f"v=spf1 include:_spf.google.com ~all",
            "message": "No SPF record found.",
        }
    if len(spf_records) > 1:
        return {
            "status": "warning",
            "record": spf_records[0],
            "suggested_record": None,
            "message": f"Multiple SPF records found ({len(spf_records)}). Only one is allowed — merge them into a single record.",
        }
    return {"status": "pass", "record": spf_records[0], "suggested_record": None, "message": None}


def _check_dmarc(domain: str) -> dict:
    records = _query_txt(f"_dmarc.{domain}")
    dmarc_records = [r for r in records if r.strip().lower().startswith("v=dmarc1")]
    if not dmarc_records:
        return {
            "status": "fail",
            "record": None,
            "suggested_record": "v=DMARC1; p=none; rua=mailto:dmarc-reports@" + domain,
            "message": "No DMARC record found.",
        }
    return {"status": "pass", "record": dmarc_records[0], "suggested_record": None, "message": None}


def _check_dkim(domain: str, manual_selector: str | None = None) -> dict:
    selectors_to_try = COMMON_DKIM_SELECTORS.copy()
    if manual_selector:
        manual_selector = manual_selector.strip()
        if manual_selector and manual_selector not in selectors_to_try:
            selectors_to_try = [manual_selector] + selectors_to_try

    found_selectors = []
    for selector in selectors_to_try:
        name = f"{selector}._domainkey.{domain}"
        records = _query_txt(name)
        dkim_records = [r for r in records if "v=dkim1" in r.lower() or "p=" in r.lower()]
        if dkim_records:
            found_selectors.append(selector)
    if not found_selectors:
        tried = ", ".join(selectors_to_try)
        return {
            "status": "fail",
            "record": None,
            "suggested_record": None,
            "message": (
                f"No DKIM record found under selector(s) checked: {tried}. "
                "DKIM selectors are provider-specific — check your email provider's setup docs "
                "for the exact selector, then enter it manually above."
            ),
        }
    return {
        "status": "pass",
        "record": f"Found under selector(s): {', '.join(found_selectors)}",
        "suggested_record": None,
        "message": None,
    }

@router.get("/check")
async def check_domain(
    domain: str = Query(..., min_length=3, max_length=255),
    dkim_selector: str | None = Query(None, max_length=100),
):
    """Run SPF, DKIM, and DMARC checks for the given domain."""
    domain = domain.strip().lower().removeprefix("http://").removeprefix("https://").split("/")[0]
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="Invalid domain")

    spf = _check_spf(domain)
    dmarc = _check_dmarc(domain)
    dkim = _check_dkim(domain, manual_selector=dkim_selector)
    blacklist = _check_blacklists(domain)

    overall = "pass"
    if any(r["status"] == "fail" for r in (spf, dmarc, dkim, blacklist)):
        overall = "fail"
    elif any(r["status"] == "warning" for r in (spf, dmarc, dkim, blacklist)):
        overall = "warning"

    return {
        "domain": domain,
        "overall_status": overall,
        "spf": spf,
        "dmarc": dmarc,
        "dkim": dkim,
        "blacklist": blacklist,
    }
