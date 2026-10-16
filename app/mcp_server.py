"""
DevOutreach — MCP (Model Context Protocol) server
=================================================

Exposes DevOutreach to AI clients (Claude Desktop, Cursor, Cline, …) as a set
of callable tools over JSON-RPC 2.0.

DESIGN NOTE
-----------
This module deliberately does NOT import your models, DB session or ORM.
Every tool calls your own REST API over HTTP using a DevOutreach API key
(the ones created in Settings → Integrating → API keys). That means:

  * no coupling to your schema — it keeps working when models change
  * permissions are already enforced by your existing auth
  * you can run it in-process or as a separate service

WIRING  (2 lines in your FastAPI app)
-------------------------------------
    from mcp_server import router as mcp_router
    app.include_router(mcp_router, prefix="/api")

ENVIRONMENT
-----------
    MCP_ENABLED=true
    MCP_PUBLIC_URL=https://app.yourdomain.com     # no trailing slash
    MCP_INTERNAL_API=http://127.0.0.1:8000/api    # where this server reaches your own API

If MCP_ENABLED is not "true", /settings/mcp-setup returns an empty payload and
the Settings page shows the "not configured" notice — no errors.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["mcp"])

# ── configuration ───────────────────────────────────────────────────────────
MCP_ENABLED      = os.getenv("MCP_ENABLED", "false").lower() == "true"
MCP_PUBLIC_URL   = os.getenv("MCP_PUBLIC_URL", "").rstrip("/")
MCP_INTERNAL_API = os.getenv("MCP_INTERNAL_API", "http://127.0.0.1:8000/api").rstrip("/")

PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME      = "devoutreach"
SERVER_VERSION   = "1.0.0"


# ════════════════════════════════════════════════════════════════════════════
#  TOOL DEFINITIONS
#  Each entry maps a tool name to the REST call it performs.
#  `path` may contain {placeholders} filled from the tool arguments.
# ════════════════════════════════════════════════════════════════════════════

TOOLS: List[Dict[str, Any]] = [
    {
        "name": "list_campaigns",
        "description": "List all outreach campaigns with their status and stats "
                       "(emails sent, replies, open rate).",
        "method": "GET",
        "path": "/campaigns",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_campaign",
        "description": "Get one campaign in full, including its settings and sending window.",
        "method": "GET",
        "path": "/campaigns/{campaign_id}",
        "inputSchema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "integer", "description": "Campaign id"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_campaign_leads",
        "description": "List the leads enrolled in a campaign, with per-lead status "
                       "(active, contacted, replied, bounced, unsubscribed).",
        "method": "GET",
        "path": "/campaigns/{campaign_id}/leads",
        "inputSchema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "integer"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_campaign_sequences",
        "description": "Get the email sequence steps for a campaign — subject lines, "
                       "bodies and wait days.",
        "method": "GET",
        "path": "/campaigns/{campaign_id}/sequences",
        "inputSchema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "integer"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_campaign_queue",
        "description": "Show upcoming scheduled sends for a campaign — when each email "
                       "goes out, to which lead, from which inbox.",
        "method": "GET",
        "path": "/campaigns/{campaign_id}/queue",
        "inputSchema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "integer"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_campaign_sent",
        "description": "List emails already sent for a campaign, with open/click/reply state.",
        "method": "GET",
        "path": "/campaigns/{campaign_id}/sent",
        "inputSchema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "integer"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "get_analytics",
        "description": "Daily analytics across a date range: emails sent, opens, unique opens, "
                       "replies, clicks. Optionally filtered to one campaign.",
        "method": "GET",
        "path": "/analytics/daily",
        "query": ["start_date", "end_date", "campaign_id"],
        "inputSchema": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date":   {"type": "string", "description": "YYYY-MM-DD"},
                "campaign_id": {"type": "integer", "description": "Optional — limit to one campaign"},
            },
            "required": ["start_date", "end_date"],
        },
    },
    {
        "name": "get_step_analytics",
        "description": "Per-sequence-step performance for a campaign — which email in the "
                       "sequence gets the most opens and replies.",
        "method": "GET",
        "path": "/campaigns/{campaign_id}/analytics/steps",
        "inputSchema": {
            "type": "object",
            "properties": {"campaign_id": {"type": "integer"}},
            "required": ["campaign_id"],
        },
    },
    {
        "name": "list_inboxes",
        "description": "List connected sending accounts (Gmail, Office 365, SMTP) with their "
                       "daily limits, warmup state and paused status.",
        "method": "GET",
        "path": "/inboxes",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "list_blocklist",
        "description": "List suppressed email addresses that will never be contacted, "
                       "and why each was blocked.",
        "method": "GET",
        "path": "/suppression",
        "inputSchema": {
            "type": "object",
            "properties": {"q": {"type": "string", "description": "Optional search term"}},
            "required": [],
        },
        "query": ["q"],
    },
    {
        "name": "add_to_blocklist",
        "description": "Add an email address to the blocklist so it is never enrolled "
                       "in any campaign.",
        "method": "POST",
        "path": "/suppression",
        "body": ["email", "reason"],
        "inputSchema": {
            "type": "object",
            "properties": {
                "email":  {"type": "string", "description": "Address to suppress"},
                "reason": {"type": "string", "description": "unsubscribed | bounced | manual",
                           "default": "manual"},
            },
            "required": ["email"],
        },
    },
    {
        "name": "get_deliverability",
        "description": "Domain reputation over time — bounce rate, open rate and complaint "
                       "trends for your sending domains.",
        "method": "GET",
        "path": "/analytics/domain-reputation",
        "query": ["days"],
        "inputSchema": {
            "type": "object",
            "properties": {"days": {"type": "integer", "description": "Look-back window, default 30"}},
            "required": [],
        },
    },
]

TOOL_BY_NAME = {t["name"]: t for t in TOOLS}


# ════════════════════════════════════════════════════════════════════════════
#  SETTINGS ENDPOINT  — what the Settings → Integrating → MCP panel reads
# ════════════════════════════════════════════════════════════════════════════

def _cursor_fragment(endpoint: str) -> str:
    return json.dumps(
        {
            "mcpServers": {
                "devoutreach": {
                    "url": endpoint,
                    "headers": {"Authorization": "Bearer YOUR_DEVOUTREACH_API_KEY"},
                }
            }
        },
        indent=2,
    )


@router.get("/settings/mcp-setup")
async def mcp_setup():
    """
    Returns exactly the shape the frontend expects:
        { endpoint: str, tools: [str], cursor_fragment: str }
    When MCP is disabled every field is empty, which makes the Settings page
    show its "not configured" notice instead of an error.
    """
    if not MCP_ENABLED or not MCP_PUBLIC_URL:
        return {"endpoint": "", "tools": [], "cursor_fragment": ""}

    endpoint = f"{MCP_PUBLIC_URL}/api/mcp"
    return {
        "endpoint": endpoint,
        "tools": [t["name"] for t in TOOLS],
        "cursor_fragment": _cursor_fragment(endpoint),
    }


# ════════════════════════════════════════════════════════════════════════════
#  JSON-RPC PLUMBING
# ════════════════════════════════════════════════════════════════════════════

def _ok(req_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _err(req_id: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _text(payload: Any, is_error: bool = False) -> Dict[str, Any]:
    body = payload if isinstance(payload, str) else json.dumps(payload, indent=2, default=str)
    return {"content": [{"type": "text", "text": body}], "isError": is_error}


async def _call_rest(tool: Dict[str, Any], args: Dict[str, Any], api_key: str) -> Any:
    """Execute a tool by calling DevOutreach's own REST API with the caller's key."""
    path = tool["path"]
    for key, value in args.items():
        path = path.replace("{" + key + "}", str(value))

    params = {k: args[k] for k in tool.get("query", []) if args.get(k) is not None}
    body   = {k: args[k] for k in tool.get("body", [])  if args.get(k) is not None}

    url = f"{MCP_INTERNAL_API}{path}"
    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            tool["method"], url, headers=headers,
            params=params or None,
            json=body or None,
        )

    if resp.status_code == 401:
        raise PermissionError("API key rejected by DevOutreach.")
    if resp.status_code >= 400:
        raise RuntimeError(f"{resp.status_code} from {path}: {resp.text[:400]}")

    try:
        return resp.json()
    except ValueError:
        return resp.text


@router.post("/mcp")
async def mcp_endpoint(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """JSON-RPC 2.0 entrypoint. Auth: `Authorization: Bearer <DevOutreach API key>`."""
    if not MCP_ENABLED:
        raise HTTPException(status_code=404, detail="MCP is not enabled on this server.")

    try:
        msg = await request.json()
    except Exception:
        return JSONResponse(_err(None, -32700, "Parse error"), status_code=400)

    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params") or {}

    # notifications carry no id and expect no response body
    if req_id is None and method and method.startswith("notifications/"):
        return JSONResponse({}, status_code=202)

    # ── handshake ──────────────────────────────────────────────────────────
    if method == "initialize":
        return _ok(req_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })

    if method == "ping":
        return _ok(req_id, {})

    # ── tool discovery ─────────────────────────────────────────────────────
    if method == "tools/list":
        return _ok(req_id, {
            "tools": [
                {"name": t["name"], "description": t["description"], "inputSchema": t["inputSchema"]}
                for t in TOOLS
            ]
        })

    # ── tool execution ─────────────────────────────────────────────────────
    if method == "tools/call":
        if not authorization or not authorization.lower().startswith("bearer "):
            return _ok(req_id, _text(
                "Missing API key. Send `Authorization: Bearer <key>` — create one in "
                "DevOutreach under Settings → Integrating → API keys.", is_error=True))

        api_key = authorization.split(" ", 1)[1].strip()
        name    = params.get("name")
        args    = params.get("arguments") or {}
        tool    = TOOL_BY_NAME.get(name)

        if tool is None:
            return _ok(req_id, _text(f"Unknown tool '{name}'.", is_error=True))

        missing = [f for f in tool["inputSchema"].get("required", []) if f not in args]
        if missing:
            return _ok(req_id, _text(
                f"Missing required argument(s): {', '.join(missing)}", is_error=True))

        try:
            return _ok(req_id, _text(await _call_rest(tool, args, api_key)))
        except PermissionError as e:
            return _ok(req_id, _text(str(e), is_error=True))
        except Exception as e:  # noqa: BLE001 — surfaced to the AI client as text
            return _ok(req_id, _text(f"{type(e).__name__}: {e}", is_error=True))

    return _err(req_id, -32601, f"Method not found: {method}")