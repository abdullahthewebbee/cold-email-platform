"""Lightweight website scraper for the Deep Personalization Engine.

Fetches a lead's website homepage and extracts clean, LLM-ready text
(title, meta description, and visible body text) — no JS execution, no
heavy headless-browser dependency. Good enough for cold-email personalization
where you just need a sense of what the company does.
"""
from __future__ import annotations

import logging
import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("quickly.website_scraper")

MAX_TEXT_CHARS = 3000
_TIMEOUT = httpx.Timeout(8.0, connect=5.0)
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; EmissaryBot/1.0; +https://devlet.tech)"
}


def _normalize_url(website: str) -> str:
    website = (website or "").strip()
    if not website:
        return ""
    if not website.startswith(("http://", "https://")):
        website = f"https://{website}"
    return website


async def scrape_website(website: str) -> str | None:
    """Fetch *website* and return clean extracted text, or None on failure.

    Tries https first, falls back to http on connection failure. Strips
    script/style/nav/footer tags before extracting text so the LLM only
    sees meaningful content, not boilerplate/JS.
    """
    url = _normalize_url(website)
    if not url:
        return None

    async def _fetch(u: str) -> httpx.Response | None:
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS) as client:
                resp = await client.get(u)
                resp.raise_for_status()
                return resp
        except Exception as e:
            log.info("scrape_website: fetch failed for %s: %s", u, e)
            return None

    resp = await _fetch(url)
    if resp is None and url.startswith("https://"):
        resp = await _fetch(url.replace("https://", "http://", 1))
    if resp is None:
        return None

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
            tag.decompose()

        parts: list[str] = []
        if soup.title and soup.title.string:
            parts.append(f"Page title: {soup.title.string.strip()}")
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            parts.append(f"Meta description: {meta_desc['content'].strip()}")

        body_text = soup.get_text(separator=" ", strip=True)
        body_text = " ".join(body_text.split())  # collapse whitespace
        parts.append(body_text)

        full_text = "\n".join(parts)
        return full_text[:MAX_TEXT_CHARS] if full_text.strip() else None
    except Exception as e:
        log.warning("scrape_website: parse failed for %s: %s", url, e)
        return None