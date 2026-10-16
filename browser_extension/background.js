// InboxAir Extension — background.js v1.1

const BASE_URL = "http://127.0.0.1:8000";
let authToken = null;

// ── Auth helpers ──────────────────────────────────────────────────────────
async function loadToken() {
  const { token } = await chrome.storage.local.get("token");
  authToken = token || null;
  return authToken;
}

async function saveToken(token) {
  authToken = token;
  await chrome.storage.local.set({ token });
}

async function clearToken() {
  authToken = null;
  await chrome.storage.local.remove("token");
}

// ── API call ──────────────────────────────────────────────────────────────
async function apiCall(method, path, body) {
  const token = authToken || await loadToken();
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  try {
    const res  = await fetch(`${BASE_URL}/api${path}`, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: e.message, data: {} };
  }
}

// ── Notification polling ──────────────────────────────────────────────────
let lastSeenNotifId = null;

async function pollNotifications() {
  const { extSettings = {} } = await chrome.storage.local.get("extSettings");
  const replyNotif = extSettings.replyNotif ?? true;
  const openNotif  = extSettings.openNotif  ?? false;

  if (!replyNotif && !openNotif) return;
  const token = await loadToken();
  if (!token) return;

  const res = await apiCall("GET", "/notifications?unread_only=true&limit=20");
  if (!res.ok || !res.data?.items) return;

  for (const n of res.data.items) {
    if (lastSeenNotifId && n.id <= lastSeenNotifId) continue;

    const isReply = n.event_type === "lead.replied";
    const isOpen  = n.event_type === "email.opened";

    if ((isReply && replyNotif) || (isOpen && openNotif)) {
      chrome.notifications.create(`notif-${n.id}`, {
        type:    "basic",
        iconUrl: "icons/icon48.png",
        title:   "InboxAir — " + n.title,
        message: n.message || "",
      });
    }
  }

  if (res.data.items.length > 0) {
    lastSeenNotifId = Math.max(...res.data.items.map(n => n.id));
  }
}

async function scheduleAlarm() {
  const { extSettings = {} } = await chrome.storage.local.get("extSettings");
  const interval = parseInt(extSettings.interval || "5");
  await chrome.alarms.clear("inboxair-poll");
  chrome.alarms.create("inboxair-poll", { periodInMinutes: interval });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "inboxair-poll") pollNotifications();
});

chrome.runtime.onInstalled.addListener(() => scheduleAlarm());
chrome.runtime.onStartup.addListener(() => scheduleAlarm());

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {

      case "CHECK_AUTH": {
        const token = await loadToken();
        if (!token) { sendResponse({ ok: true, loggedIn: false }); return; }
        const res = await apiCall("GET", "/auth/me");
        sendResponse({ ok: true, loggedIn: res.ok });
        break;
      }

      case "LOGIN": {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: msg.username, password: msg.password }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const token = data.access_token || data.token;
          if (token) {
            await saveToken(token);
            scheduleAlarm();
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: "No token in response" });
          }
        } else {
          const err = await res.json().catch(() => ({}));
          sendResponse({ ok: false, error: err.detail || "Login failed" });
        }
        break;
      }

      case "LOGOUT": {
        await clearToken();
        chrome.alarms.clear("inboxair-poll");
        sendResponse({ ok: true });
        break;
      }

      case "API_GET": {
        const res = await apiCall("GET", msg.path);
        sendResponse(res);
        break;
      }

      case "API_POST": {
        const res = await apiCall("POST", msg.path, msg.body);
        sendResponse(res);
        break;
      }

      case "API_PATCH": {
        const res = await apiCall("PATCH", msg.path, msg.body || {});
        sendResponse(res);
        break;
      }

      case "UPDATE_SETTINGS": {
        await chrome.storage.local.set({ extSettings: msg.extSettings });
        await scheduleAlarm();
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();
  return true; // keep channel open for async
});

// ── Context menu ──────────────────────────────────────────────────────────
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: "inboxair-add-lead",
    title: "Add to InboxAir as lead",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "inboxair-add-lead") {
    await chrome.storage.local.set({ pending_selection: info.selectionText });
    chrome.action.openPopup?.();
  }
});
