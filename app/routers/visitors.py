"""Website visitor ID.

Authenticated (org-scoped) API:
    GET    /api/visitors/sites
    POST   /api/visitors/sites            {name, domain}
    DELETE /api/visitors/sites/{id}
    GET    /api/visitors                  ?site_id=&status=identified|anonymous&q=&limit=
    POST   /api/visitors/{id}/add-to-campaign   {campaign_id}

Public (no auth; called from customers' websites):
    GET  /api/visitors/pixel.js?k=<public_key>
    POST /api/visitors/collect            text/plain JSON body {k, vid, url, referrer, event, ...}

Identification:
  * ``window.inboxairIdentify({email, name, company, title})`` and automatic capture of
    e-mail fields when a form on the site is submitted (sets ``identified``).
  * Optional company enrichment by IP: set VISITOR_ENRICH_URL (use ``{ip}`` as placeholder)
    and optionally VISITOR_ENRICH_KEY (sent as ``Authorization: Bearer``). The response JSON
    is read for ``company``/``name``/``org`` and ``city``/``country``. Configure only a provider
    you are permitted to use, and make sure your privacy policy / consent flow covers it.
The script honours Do-Not-Track and ``window.inboxairOptOut = true``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import urllib.request
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_org_id
from app.client_ip import client_ip_from_request
from app.database import get_db
from app.models import Campaign, Visitor, VisitorSite
from app.rate_limit import limiter
from app.schemas import CampaignLeadAdd
from app.time import utcnow

log = logging.getLogger("quickly.visitors")

router = APIRouter(prefix="/api/visitors", tags=["visitors"])
public_router = APIRouter(prefix="/api/visitors", tags=["visitors-public"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")
SESSION_GAP_SECONDS = 30 * 60


class SiteCreate(BaseModel):
    name: str = ""
    domain: str


class AddToCampaign(BaseModel):
    campaign_id: int


def _clean_domain(raw: str) -> str:
    d = (raw or "").strip().lower()
    if "://" in d:
        d = urlparse(d).hostname or ""
    d = d.split("/")[0].split(":")[0]
    if d.startswith("www."):
        d = d[4:]
    return d


def _site_dict(s: VisitorSite) -> dict:
    return {
        "id": s.id, "name": s.name, "domain": s.domain, "public_key": s.public_key,
        "last_event_at": s.last_event_at.isoformat() if s.last_event_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _visitor_dict(v: Visitor) -> dict:
    return {
        "id": v.id, "site_id": v.site_id, "name": v.name or "", "email": v.email or "",
        "company": v.company or "", "title": v.title or "", "location": v.location or "",
        "identified": bool(v.identified), "pages_viewed": v.pages_viewed or 0, "visits": v.visits or 0,
        "last_url": v.last_url or "", "referrer": v.referrer or "", "lead_id": v.lead_id,
        "first_seen": v.first_seen.isoformat() if v.first_seen else None,
        "last_seen": v.last_seen.isoformat() if v.last_seen else None,
    }


# ── authenticated API ──────────────────────────────────────────────────────

@router.get("/sites")
async def list_sites(db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    rows = (await db.execute(
        select(VisitorSite).where(VisitorSite.org_id == org_id).order_by(VisitorSite.created_at.desc())
    )).scalars().all()
    return [_site_dict(r) for r in rows]


@router.post("/sites", status_code=201)
async def create_site(
    data: SiteCreate,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    domain = _clean_domain(data.domain)
    if not _DOMAIN_RE.match(domain):
        raise HTTPException(422, "Enter a valid domain, e.g. acme.com")
    exists = (await db.execute(
        select(VisitorSite.id).where(VisitorSite.org_id == org_id, VisitorSite.domain == domain)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "This website is already added")
    site = VisitorSite(org_id=org_id, name=(data.name or domain).strip()[:255], domain=domain)
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return _site_dict(site)


@router.delete("/sites/{site_id}")
async def delete_site(site_id: int, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    site = (await db.execute(
        select(VisitorSite).where(VisitorSite.id == site_id, VisitorSite.org_id == org_id)
    )).scalar_one_or_none()
    if not site:
        raise HTTPException(404, "Website not found")
    await db.execute(delete(Visitor).where(Visitor.site_id == site.id))
    await db.delete(site)
    await db.commit()
    return {"ok": True}


@router.get("")
async def list_visitors(
    site_id: int | None = None,
    status: str = "",
    q: str = "",
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    stmt = select(Visitor).where(Visitor.org_id == org_id)
    if site_id:
        stmt = stmt.where(Visitor.site_id == site_id)
    if status == "identified":
        stmt = stmt.where(Visitor.identified.is_(True))
    elif status == "anonymous":
        stmt = stmt.where(Visitor.identified.is_(False))
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            func.lower(func.coalesce(Visitor.email, "")).like(like)
            | func.lower(func.coalesce(Visitor.name, "")).like(like)
            | func.lower(func.coalesce(Visitor.company, "")).like(like)
        )
    stmt = stmt.order_by(Visitor.last_seen.desc()).limit(max(1, min(limit, 500)))
    return [_visitor_dict(v) for v in (await db.execute(stmt)).scalars().all()]


@router.post("/{visitor_id}/add-to-campaign")
async def add_visitor_to_campaign(
    visitor_id: int,
    data: AddToCampaign,
    db: AsyncSession = Depends(get_db),
    org_id: int | None = Depends(get_current_org_id),
):
    v = (await db.execute(select(Visitor).where(Visitor.id == visitor_id, Visitor.org_id == org_id))).scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Visitor not found")
    if not v.email:
        raise HTTPException(400, "This visitor has no email address yet")
    camp = (await db.execute(
        select(Campaign.id).where(Campaign.id == data.campaign_id, Campaign.org_id == org_id)
    )).scalar_one_or_none()
    if not camp:
        raise HTTPException(404, "Campaign not found")

    from app.suppression import is_suppressed
    if await is_suppressed(db, org_id, v.email):
        raise HTTPException(400, "This email is on your blocklist")

    # Reuse the normal enrolment path (find/create lead, queue slots, eligibility rules).
    from app.routers.campaigns import bulk_add_leads_to_campaign
    custom = {k: val for k, val in {
        "company": v.company, "title": v.title, "location": v.location, "source": "website_visitor",
    }.items() if val}
    result = await bulk_add_leads_to_campaign(
        data.campaign_id,
        [CampaignLeadAdd(email=v.email, name=v.name or "", custom_data=custom)],
        skip_duplicates=True, verify_emails=False, confirm_only=False, db=db, org_id=org_id,
    )
    from app.models import Lead
    lead_id = (await db.execute(select(Lead.id).where(Lead.org_id == org_id, Lead.email == v.email.lower()))).scalar_one_or_none()
    if lead_id:
        v.lead_id = lead_id
        await db.commit()
    return {"ok": True, "lead_id": lead_id, "added": result.get("added", 0), "already_enrolled": result.get("already_enrolled", 0)}


# ── public: script + collector ─────────────────────────────────────────────

_PIXEL_JS = r"""(function(){
try{
var d=document,w=window,n=navigator;
if(n.doNotTrack==='1'||w.doNotTrack==='1'||w.inboxairOptOut===true)return;
var s=d.currentScript;var base=s&&s.src?s.src.split('/api/visitors/')[0]:'';
var k=(s&&s.src?new URL(s.src).searchParams.get('k'):'')||'';
if(!k||!base)return;
var ep=base+'/api/visitors/collect';
var vid;try{vid=localStorage.getItem('ia_vid');if(!vid){vid=(w.crypto&&crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)+Date.now());localStorage.setItem('ia_vid',vid);}}catch(e){vid=String(Math.random()).slice(2)+Date.now();}
function send(p){p.k=k;p.vid=vid;p.url=location.href;p.referrer=d.referrer||'';
try{fetch(ep,{method:'POST',mode:'no-cors',keepalive:true,headers:{'Content-Type':'text/plain'},body:JSON.stringify(p)});}catch(e){}}
send({event:'pageview'});
w.inboxairIdentify=function(i){if(i&&i.email)send({event:'identify',email:i.email,name:i.name||'',company:i.company||'',title:i.title||''});};
d.addEventListener('submit',function(e){try{var f=e.target;if(!f||!f.querySelector)return;
var em=f.querySelector('input[type=email],input[name*=email i]');if(!em||!em.value)return;
var nm=f.querySelector('input[name*=name i]:not([name*=company i]):not([name*=user i])');
var co=f.querySelector('input[name*=company i],input[name*=organi i]');
send({event:'identify',email:em.value,name:nm?nm.value:'',company:co?co.value:''});}catch(x){}},true);
}catch(e){}
})();"""


@public_router.get("/pixel.js")
async def pixel_js():
    return Response(
        _PIXEL_JS,
        media_type="application/javascript",
        headers={"Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*"},
    )


def _enrich_sync(ip: str) -> dict:
    url = os.getenv("VISITOR_ENRICH_URL", "").strip()
    if not url or not ip:
        return {}
    try:
        req = urllib.request.Request(url.replace("{ip}", ip))
        key = os.getenv("VISITOR_ENRICH_KEY", "").strip()
        if key:
            req.add_header("Authorization", f"Bearer {key}")
        with urllib.request.urlopen(req, timeout=4) as r:  # noqa: S310 (operator-configured URL)
            data = json.loads(r.read().decode("utf-8", "ignore"))
        company = data.get("company") or data.get("org") or data.get("name") or ""
        if isinstance(company, dict):
            company = company.get("name", "")
        loc = ", ".join(x for x in (data.get("city"), data.get("country")) if x)
        return {"company": str(company)[:255], "location": loc[:255]}
    except Exception:
        return {}


def _origin_matches(request: Request, domain: str) -> bool:
    src = request.headers.get("origin") or request.headers.get("referer") or ""
    host = (urlparse(src).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return bool(host) and (host == domain or host.endswith("." + domain))


@public_router.post("/collect")
@limiter.limit("240/minute")
async def collect(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        raw = await request.body()
        if len(raw) > 4096:
            return Response(status_code=204)
        p = json.loads(raw.decode("utf-8", "ignore") or "{}")
    except Exception:
        return Response(status_code=204)
    if not isinstance(p, dict):
        return Response(status_code=204)

    key = str(p.get("k") or "")[:64]
    vid = str(p.get("vid") or "")[:64]
    if not key or not vid:
        return Response(status_code=204)
    site = (await db.execute(select(VisitorSite).where(VisitorSite.public_key == key))).scalar_one_or_none()
    if not site or not _origin_matches(request, site.domain):
        return Response(status_code=204)

    now = utcnow()
    v = (await db.execute(
        select(Visitor).where(Visitor.site_id == site.id, Visitor.visitor_key == vid)
    )).scalar_one_or_none()
    is_new = v is None
    if is_new:
        v = Visitor(org_id=site.org_id, site_id=site.id, visitor_key=vid, first_seen=now,
                    visits=1, pages_viewed=0, identified=False)
        db.add(v)
        ip = client_ip_from_request(request) or ""
        enrich = await asyncio.to_thread(_enrich_sync, ip)
        if enrich.get("company"):
            v.company = enrich["company"]
        if enrich.get("location"):
            v.location = enrich["location"]
    elif v.last_seen and (now - v.last_seen).total_seconds() > SESSION_GAP_SECONDS:
        v.visits = (v.visits or 0) + 1

    event = str(p.get("event") or "pageview")
    if event == "pageview":
        v.pages_viewed = (v.pages_viewed or 0) + 1
        v.last_url = str(p.get("url") or "")[:1000]
        if is_new or not v.referrer:
            v.referrer = str(p.get("referrer") or "")[:1000]
    elif event == "identify":
        email = str(p.get("email") or "").strip().lower()[:255]
        if _EMAIL_RE.match(email):
            v.email = email
            v.identified = True
            if p.get("name"):
                v.name = str(p["name"]).strip()[:255]
            if p.get("company"):
                v.company = str(p["company"]).strip()[:255]
            if p.get("title"):
                v.title = str(p["title"]).strip()[:255]
    v.last_seen = now
    site.last_event_at = now
    await db.commit()
    return Response(status_code=204)
