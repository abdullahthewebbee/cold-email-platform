"""DNS Doctor v2: checks SPF, DKIM, DMARC, MTA-STS, TLS-RPT, BIMI, and DNSSEC
for a domain, computes a 0-100 Deliverability Health Score with a letter
grade, and returns plain-English remediation with copy-pastable DNS records
for anything that's missing or weak.

Uses `checkdmarc` for the advanced checks (SPF lookup-count, DMARC policy
strength, MTA-STS/TLS-RPT/BIMI/DNSSEC) since it already implements RFC-correct
parsing for all of these — this file's own job is just DKIM (checkdmarc
doesn't check DKIM) and blacklist checks, then combining everything into one
scored report.
"""
from __future__ import annotations

import logging
import dns.resolver
from fastapi import APIRouter, HTTPException, Query, Request
from app.rate_limit import limiter

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


# ---------------------------------------------------------------------------
# checkdmarc-powered advanced checks
# ---------------------------------------------------------------------------

def _run_checkdmarc(domain: str) -> dict | None:
    """Run checkdmarc's full domain check. Returns None on total failure
    (e.g. unresolvable domain) — callers fall back to basic checks only."""
    try:
        import checkdmarc
        return checkdmarc.check_domains([domain], include_tag_descriptions=False, timeout=5)
    except Exception as e:
        log.warning("checkdmarc failed for %s: %s", domain, e)
        return None


def _check_spf_advanced(cd: dict | None, domain: str) -> dict:
    """SPF check using checkdmarc's data: presence, DNS-lookup count (RFC 7208
    limit of 10), and a dangerous '+all' (pass-all) mechanism."""
    if not cd or not cd.get("spf", {}).get("record"):
        return {
            "status": "fail",
            "record": None,
            "suggested_record": "v=spf1 include:_spf.google.com ~all",
            "message": "No SPF record found.",
        }
    spf = cd["spf"]
    record = spf.get("record")
    lookups = spf.get("dns_lookups", 0)
    all_qualifier = (spf.get("parsed") or {}).get("all")

    if not spf.get("valid", True):
        return {
            "status": "fail",
            "record": record,
            "suggested_record": None,
            "message": "; ".join(spf.get("warnings") or ["SPF record is invalid."]),
        }
    if all_qualifier == "pass":
        return {
            "status": "fail",
            "record": record,
            "suggested_record": record.replace("+all", "~all") if record else None,
            "message": "This SPF record ends in '+all', which lets ANYONE send email as this domain. This is a serious security risk — change it to '~all' (soft fail) or '-all' (hard fail).",
        }
    if lookups > 10:
        return {
            "status": "fail",
            "record": record,
            "suggested_record": None,
            "message": f"This SPF record uses {lookups} DNS lookups, exceeding the RFC 7208 limit of 10. Mail servers will treat this as a permanent SPF failure — flatten or trim the includes.",
        }
    if lookups >= 8:
        return {
            "status": "warning",
            "record": record,
            "suggested_record": None,
            "message": f"This SPF record uses {lookups} of the 10 allowed DNS lookups. It's close to the RFC 7208 limit — consider trimming it before adding more includes.",
        }
    return {
        "status": "pass",
        "record": record,
        "suggested_record": None,
        "message": f"{lookups}/10 DNS lookups used.",
    }


_DMARC_POLICY_LABEL = {"none": "monitoring only (p=none) — not enforced", "quarantine": "quarantine (p=quarantine)", "reject": "reject (p=reject) — fully enforced"}


def _check_dmarc_advanced(cd: dict | None, domain: str) -> dict:
    if not cd or not cd.get("dmarc", {}).get("record"):
        return {
            "status": "fail",
            "record": None,
            "suggested_record": f"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@{domain}",
            "message": "No DMARC record found.",
        }
    dmarc = cd["dmarc"]
    record = dmarc.get("record")
    if not dmarc.get("valid", True):
        return {
            "status": "fail",
            "record": record,
            "suggested_record": None,
            "message": "; ".join(dmarc.get("warnings") or ["DMARC record is invalid."]),
        }
    policy = (dmarc.get("tags") or {}).get("p", {}).get("value", "none")
    label = _DMARC_POLICY_LABEL.get(policy, policy)
    if policy == "none":
        return {
            "status": "warning",
            "record": record,
            "suggested_record": record.replace("p=none", "p=quarantine") if record and "p=none" in record else f"v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@{domain}",
            "message": f"DMARC policy is {label}. This only monitors — it doesn't stop spoofed mail. Move to p=quarantine or p=reject once you've reviewed reports.",
        }
    return {
        "status": "pass",
        "record": record,
        "suggested_record": None,
        "message": f"DMARC policy: {label}.",
    }


def _check_mta_sts(cd: dict | None, domain: str) -> dict:
    if not cd:
        return {"status": "warning", "record": None, "suggested_record": None, "message": "Could not check MTA-STS."}
    mta_sts = cd.get("mta_sts", {})
    if not mta_sts.get("valid"):
        return {
            "status": "warning",
            "record": None,
            "suggested_record": f'_mta-sts.{domain} TXT "v=STSv1; id={{timestamp}}"  (plus a hosted policy file)',
            "message": "MTA-STS is not configured. It's optional but increasingly expected by Gmail/Yahoo — it enforces TLS-in-transit for mail delivered to this domain.",
        }
    mode = (mta_sts.get("policy") or {}).get("mode", "")
    return {
        "status": "pass",
        "record": f"mode={mode}",
        "suggested_record": None,
        "message": None,
    }


def _check_tls_rpt(cd: dict | None, domain: str) -> dict:
    if not cd:
        return {"status": "warning", "record": None, "suggested_record": None, "message": "Could not check TLS-RPT."}
    tls_rpt = cd.get("smtp_tls_reporting", {})
    if not tls_rpt.get("valid"):
        return {
            "status": "warning",
            "record": None,
            "suggested_record": f'_smtp._tls.{domain} TXT "v=TLSRPTv1; rua=mailto:tls-reports@{domain}"',
            "message": "TLS-RPT is not configured. It's optional — it gives you a reporting endpoint for TLS delivery failures to this domain.",
        }
    return {"status": "pass", "record": "Configured", "suggested_record": None, "message": None}


def _check_bimi(cd: dict | None, domain: str) -> dict:
    if not cd:
        return {"status": "warning", "record": None, "suggested_record": None, "message": "Could not check BIMI."}
    bimi = cd.get("bimi", {})
    if not bimi.get("valid"):
        return {
            "status": "warning",
            "record": None,
            "suggested_record": None,
            "message": "BIMI is not configured (optional — shows your brand logo in supporting inboxes like Gmail, boosting recipient trust).",
        }
    return {"status": "pass", "record": "Configured", "suggested_record": None, "message": None}


def _check_dnssec(cd: dict | None, domain: str) -> dict:
    if not cd:
        return {"status": "warning", "record": None, "suggested_record": None, "message": "Could not check DNSSEC."}
    enabled = bool(cd.get("dnssec"))
    if not enabled:
        return {
            "status": "warning",
            "record": None,
            "suggested_record": None,
            "message": "DNSSEC is not enabled for this domain. It's optional — it cryptographically signs your DNS to prevent spoofing/cache-poisoning attacks. Enable it through your domain registrar/DNS host.",
        }
    return {"status": "pass", "record": "Enabled", "suggested_record": None, "message": None}


# ---------------------------------------------------------------------------
# Deliverability Health Score (0-100) + letter grade
# ---------------------------------------------------------------------------

_SCORE_WEIGHTS = {
    "spf": 15, "spf_lookups": 5,
    "dkim": 15,
    "dmarc": 10, "dmarc_policy": 10,
    "blacklist": 10,
    "mta_sts": 10, "tls_rpt": 5, "dnssec": 5, "bimi": 5,
}  # sums to 100


def _score_check(result: dict, weight: int) -> int:
    if result["status"] == "pass":
        return weight
    if result["status"] == "warning":
        return weight // 2
    return 0


def _compute_health_score(spf: dict, dkim: dict, dmarc: dict, blacklist: dict, mta_sts: dict, tls_rpt: dict, dnssec: dict, bimi: dict, dmarc_policy_pass: bool) -> dict:
    total = (
        _score_check(spf, _SCORE_WEIGHTS["spf"])
        + _score_check(dkim, _SCORE_WEIGHTS["dkim"])
        + _score_check(dmarc, _SCORE_WEIGHTS["dmarc"])
        + (_SCORE_WEIGHTS["dmarc_policy"] if dmarc_policy_pass else (_SCORE_WEIGHTS["dmarc_policy"] // 2 if dmarc["status"] == "warning" else 0))
        + _score_check(blacklist, _SCORE_WEIGHTS["blacklist"])
        + _score_check(mta_sts, _SCORE_WEIGHTS["mta_sts"])
        + _score_check(tls_rpt, _SCORE_WEIGHTS["tls_rpt"])
        + _score_check(dnssec, _SCORE_WEIGHTS["dnssec"])
        + _score_check(bimi, _SCORE_WEIGHTS["bimi"])
    )
    # SPF lookup-count sub-score (folded in separately since spf's own status covers
    # presence/validity/+all, and lookup-count is graded on its own scale above)
    if spf["status"] == "pass":
        total += _SCORE_WEIGHTS["spf_lookups"]
    elif spf["status"] == "warning" and "DNS lookups" in (spf.get("message") or ""):
        total += _SCORE_WEIGHTS["spf_lookups"] // 2
    total = min(100, total)

    if total >= 90:
        grade = "A"
    elif total >= 80:
        grade = "B"
    elif total >= 70:
        grade = "C"
    elif total >= 60:
        grade = "D"
    else:
        grade = "F"
    return {"score": total, "grade": grade}


@router.get("/check")
@limiter.limit("15/minute")  # multiple external DNS lookups per call
async def check_domain(
    request: Request,
    domain: str = Query(..., min_length=3, max_length=255),
    dkim_selector: str | None = Query(None, max_length=100),
):
    """Run the full DNS Doctor v2 check: SPF, DKIM, DMARC, MTA-STS, TLS-RPT,
    BIMI, DNSSEC, and blacklist status — plus a 0-100 Deliverability Health
    Score with letter grade."""
    domain = domain.strip().lower().removeprefix("http://").removeprefix("https://").split("/")[0]
    if not domain or "." not in domain:
        raise HTTPException(status_code=400, detail="Invalid domain")

    cd = _run_checkdmarc(domain)

    spf = _check_spf_advanced(cd, domain)
    dmarc = _check_dmarc_advanced(cd, domain)
    dkim = _check_dkim(domain, manual_selector=dkim_selector)
    blacklist = _check_blacklists(domain)
    mta_sts = _check_mta_sts(cd, domain)
    tls_rpt = _check_tls_rpt(cd, domain)
    bimi = _check_bimi(cd, domain)
    dnssec = _check_dnssec(cd, domain)

    dmarc_policy_pass = False
    if cd:
        policy = (cd.get("dmarc", {}).get("tags") or {}).get("p", {}).get("value")
        dmarc_policy_pass = policy in ("quarantine", "reject")

    health = _compute_health_score(spf, dkim, dmarc, blacklist, mta_sts, tls_rpt, dnssec, bimi, dmarc_policy_pass)

    overall = "pass"
    if any(r["status"] == "fail" for r in (spf, dmarc, dkim, blacklist)):
        overall = "fail"
    elif any(r["status"] == "warning" for r in (spf, dmarc, dkim, blacklist, mta_sts, tls_rpt, bimi, dnssec)):
        overall = "warning"

    return {
        "domain": domain,
        "overall_status": overall,
        "health_score": health["score"],
        "health_grade": health["grade"],
        "spf": spf,
        "dmarc": dmarc,
        "dkim": dkim,
        "blacklist": blacklist,
        "mta_sts": mta_sts,
        "tls_rpt": tls_rpt,
        "bimi": bimi,
        "dnssec": dnssec,
    }