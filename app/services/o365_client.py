"""Office 365 / Microsoft Graph HTTP API client — low-level functions.

Extracted from app/unibox.py (Phase 5 module split). Mirrors
gmail_client.py's structure. These functions do not call
refresh_office365_token, so their callers (which do) safely remain in
unibox.py. Reuses GmailAPIError rather than duplicating it.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Office365SyncState, Office365Account
from app.services.gmail_client import GmailAPIError


GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"


def _graph_request_json(
    method: str,
    url: str,
    access_token: str,
    *,
    params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Make an HTTP request to Microsoft Graph API and return JSON."""
    if params:
        encoded = urllib.parse.urlencode(params, doseq=True)
        url = f"{url}?{encoded}"

    body = None
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, data=body, method=method, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body_text = ""
        try:
            body_text = exc.read().decode("utf-8")
        except Exception:
            body_text = str(exc)
        raise GmailAPIError(exc.code, body_text) from exc
    except Exception as exc:
        raise GmailAPIError(0, str(exc)) from exc


def _graph_list_messages(
    access_token: str,
    *,
    folder: str = "",
    top: int = 100,
    filter_str: str = "",
    select_fields: str = "id,conversationId,internetMessageId,receivedDateTime,subject,from,toRecipients,body,isRead,hasAttachments",
    delta_link: str = "",
    use_delta_endpoint: bool = False,
) -> tuple[list[dict[str, Any]], str]:
    """Fetch messages from Microsoft Graph, returning (messages, next_delta_link).

    If *delta_link* is provided, uses it for incremental sync.
    If *use_delta_endpoint* is True (and no delta_link), uses the /delta endpoint
    so that Graph returns a deltaLink usable for future incremental syncs.
    Otherwise fetches from the regular messages endpoint with optional folder/filter.
    """
    messages: list[dict[str, Any]] = []
    next_link: str | None = None

    if delta_link:
        url = delta_link
    elif use_delta_endpoint:
        _folder = folder or "Inbox"
        base = f"{GRAPH_API_BASE}/me/mailFolders/{_folder}/messages/delta"
        params: dict[str, str] = {
            "$top": str(top),
            "$select": select_fields,
            # NOTE: $orderby is not supported on the delta endpoint
        }
        if filter_str:
            params["$filter"] = filter_str
        url = f"{base}?{urllib.parse.urlencode(params)}"
    else:
        base = f"{GRAPH_API_BASE}/me/mailFolders/{folder}/messages" if folder else f"{GRAPH_API_BASE}/me/messages"
        params = {
            "$top": str(top),
            "$select": select_fields,
            "$orderby": "receivedDateTime desc",
        }
        if filter_str:
            params["$filter"] = filter_str
        url = f"{base}?{urllib.parse.urlencode(params)}"

    new_delta_link = ""

    while url:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
                "Prefer": "odata.maxpagesize=100",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body_text = ""
            try:
                body_text = exc.read().decode("utf-8")
            except Exception:
                pass
            raise GmailAPIError(exc.code, body_text) from exc

        for msg in data.get("value", []):
            if isinstance(msg, dict):
                messages.append(msg)

        # Check for delta link or next page
        if "@odata.deltaLink" in data:
            new_delta_link = data["@odata.deltaLink"]
        next_link = data.get("@odata.nextLink")
        url = next_link if next_link else ""

    return messages, new_delta_link


async def _get_or_create_o365_sync_state(db: AsyncSession, inbox_id: int) -> Office365SyncState:
    res = await db.execute(select(Office365SyncState).where(Office365SyncState.inbox_id == inbox_id))
    state = res.scalar_one_or_none()
    if state:
        return state
    state = Office365SyncState(inbox_id=inbox_id)
    db.add(state)
    await db.flush()
    return state
