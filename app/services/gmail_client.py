"""Gmail HTTP API client — low-level request/response functions.

Extracted from app/unibox.py (Phase 5 module split). These functions call
the Gmail REST API directly and raise/return data; they do not touch
refresh_access_token or webhook firing, so moving them does not affect
the monkeypatch targets tests use (app.unibox._gmail_get_profile etc. --
unibox.py re-exports these names, and all callers remain in unibox.py,
so patched names still resolve correctly at call time).
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import GmailSyncState, GmailAccount
from dataclasses import dataclass

GMAIL_API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me"


@dataclass
class GmailHistoryDelta:
    added_ids: set[str]
    deleted_ids: set[str]
    touched_threads: set[str]
    latest_history_id: str
GMAIL_METADATA_HEADERS = [
    "From",
    "To",
    "Subject",
    "Date",
    "Message-Id",
    "In-Reply-To",
    "References",
]


class GmailAPIError(RuntimeError):
    """Raised when Gmail API returns an error."""

    def __init__(self, status_code: int, body: str):
        super().__init__(f"Gmail API error {status_code}: {body}")
        self.status_code = status_code
        self.body = body


def _gmail_request_json(
    method: str,
    url: str,
    access_token: str,
    *,
    params: dict[str, Any] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
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

    import time as _time
    last_exc = None
    for attempt in range(3):
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
            last_exc = exc
            if attempt < 2:
                _time.sleep(2 ** attempt)
                continue
    raise GmailAPIError(0, str(last_exc)) from last_exc


def _gmail_get_profile(access_token: str) -> dict[str, Any]:
    return _gmail_request_json("GET", f"{GMAIL_API_ROOT}/profile", access_token)


def _gmail_list_message_ids(
    access_token: str,
    *,
    query: str | None = None,
    max_messages: int | None = None,
    include_spam_trash: bool = True,
) -> list[str]:
    out: list[str] = []
    page_token: str | None = None

    while True:
        params: dict[str, Any] = {
            "maxResults": 500,
            "includeSpamTrash": "true" if include_spam_trash else "false",
        }
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token
        payload = _gmail_request_json("GET", f"{GMAIL_API_ROOT}/messages", access_token, params=params)

        for item in payload.get("messages", []) or []:
            if isinstance(item, dict) and item.get("id"):
                out.append(str(item["id"]))
                if max_messages and len(out) >= max_messages:
                    return out

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return out


def _gmail_list_all_message_ids(access_token: str, *, max_messages: int | None = None) -> list[str]:
    return _gmail_list_message_ids(access_token, max_messages=max_messages)


def _gmail_list_message_ids_in_window(
    access_token: str,
    *,
    start_dt: datetime,
    end_dt: datetime,
    max_messages: int | None = None,
) -> list[str]:
    start_unix = int(start_dt.timestamp())
    end_unix = int(end_dt.timestamp())
    query = f"after:{start_unix} before:{end_unix}"
    return _gmail_list_message_ids(access_token, query=query, max_messages=max_messages)


def _gmail_get_message(
    access_token: str,
    gmail_message_id: str,
    *,
    payload_format: str = "full",
) -> dict[str, Any]:
    params: dict[str, Any] = {"format": payload_format}
    if payload_format == "metadata":
        params["metadataHeaders"] = GMAIL_METADATA_HEADERS
    return _gmail_request_json(
        "GET",
        f"{GMAIL_API_ROOT}/messages/{gmail_message_id}",
        access_token,
        params=params,
    )


def _gmail_get_thread(
    access_token: str,
    thread_id: str,
    *,
    payload_format: str = "full",
) -> dict[str, Any]:
    params: dict[str, Any] = {"format": payload_format}
    if payload_format == "metadata":
        params["metadataHeaders"] = GMAIL_METADATA_HEADERS
    return _gmail_request_json(
        "GET",
        f"{GMAIL_API_ROOT}/threads/{thread_id}",
        access_token,
        params=params,
    )


def _gmail_history_delta(access_token: str, start_history_id: str) -> GmailHistoryDelta:
    page_token: str | None = None
    added_ids: set[str] = set()
    deleted_ids: set[str] = set()
    touched_threads: set[str] = set()
    latest_history_id = start_history_id

    while True:
        params: dict[str, Any] = {
            "startHistoryId": start_history_id,
            "maxResults": 500,
            "historyTypes": ["messageAdded", "messageDeleted"],
        }
        if page_token:
            params["pageToken"] = page_token

        payload = _gmail_request_json("GET", f"{GMAIL_API_ROOT}/history", access_token, params=params)
        latest_history_id = str(payload.get("historyId") or latest_history_id)

        history_rows = payload.get("history", []) or []
        for row in history_rows:
            if not isinstance(row, dict):
                continue
            row_hid = row.get("id")
            if row_hid:
                latest_history_id = str(row_hid)

            for entry in row.get("messagesAdded", []) or []:
                msg = entry.get("message", {}) if isinstance(entry, dict) else {}
                msg_id = msg.get("id")
                thread_id = msg.get("threadId")
                if msg_id:
                    added_ids.add(str(msg_id))
                if thread_id:
                    touched_threads.add(str(thread_id))

            for entry in row.get("messagesDeleted", []) or []:
                msg = entry.get("message", {}) if isinstance(entry, dict) else {}
                msg_id = msg.get("id")
                thread_id = msg.get("threadId")
                if msg_id:
                    deleted_ids.add(str(msg_id))
                if thread_id:
                    touched_threads.add(str(thread_id))

            # Some history rows provide only "messages" for metadata changes.
            for msg in row.get("messages", []) or []:
                if isinstance(msg, dict):
                    mid = msg.get("id")
                    tid = msg.get("threadId")
                    if mid:
                        added_ids.add(str(mid))
                    if tid:
                        touched_threads.add(str(tid))

        page_token = payload.get("nextPageToken")
        if not page_token:
            break

    return GmailHistoryDelta(
        added_ids=added_ids,
        deleted_ids=deleted_ids,
        touched_threads=touched_threads,
        latest_history_id=latest_history_id,
    )


def _gmail_register_watch(access_token: str, topic_name: str) -> tuple[str, datetime | None]:
    payload = {"topicName": topic_name}
    res = _gmail_request_json("POST", f"{GMAIL_API_ROOT}/watch", access_token, payload=payload)
    history_id = str(res.get("historyId", ""))
    expiration_raw = res.get("expiration")
    expiration_dt: datetime | None = None
    if expiration_raw:
        try:
            expiration_dt = datetime.utcfromtimestamp(int(expiration_raw) / 1000.0)
        except Exception:
            expiration_dt = None
    return history_id, expiration_dt


async def _get_or_create_sync_state(db: AsyncSession, inbox_id: int) -> GmailSyncState:
    res = await db.execute(select(GmailSyncState).where(GmailSyncState.inbox_id == inbox_id))
    state = res.scalar_one_or_none()
    if state:
        return state
    state = GmailSyncState(inbox_id=inbox_id)
    db.add(state)
    await db.flush()
    return state
