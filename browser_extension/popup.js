// InboxAir Extension — popup.js v1.1

const BASE_URL = "http://127.0.0.1:8000";

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

// ── DOM refs ──────────────────────────────────────────────────────────────
const loginView     = document.getElementById("login-view");
const mainView      = document.getElementById("main-view");
const headerActions = document.getElementById("header-actions");
const logoutBtn     = document.getElementById("logout-btn");
const dashboardBtn  = document.getElementById("dashboard-btn");
const loginBtn      = document.getElementById("login-btn");
const loginError    = document.getElementById("login-error");
const addBtn        = document.getElementById("add-btn");
const toast         = document.getElementById("toast");
const notifBadge    = document.getElementById("notif-badge");

const fields = {
  email:      document.getElementById("field-email"),
  name:       document.getElementById("field-name"),
  business:   document.getElementById("field-business"),
  website:    document.getElementById("field-website"),
  industry:   document.getElementById("field-industry"),
  customJson: document.getElementById("field-custom-json"),
  campaign:   document.getElementById("field-campaign"),
};

// ── Helpers ───────────────────────────────────────────────────────────────
function showToast(el, message, kind) {
  el.textContent = message;
  el.className = `toast ${kind}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function showView(view) {
  loginView.hidden       = view !== "login";
  mainView.hidden        = view !== "main";
  headerActions.hidden   = view !== "main";
  dashboardBtn.href      = BASE_URL;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Tab switching ─────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.hidden = true);
    btn.classList.add("active");
    const panel = document.getElementById("tab-" + btn.dataset.tab);
    if (panel) panel.hidden = false;

    if (btn.dataset.tab === "notifications") loadNotifications();
    if (btn.dataset.tab === "settings")      loadSettings();
  });
});

// ── Login ─────────────────────────────────────────────────────────────────
loginBtn.addEventListener("click", async () => {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  if (!username || !password) return;
  loginBtn.disabled = true;
  loginError.hidden = true;
  const res = await sendMessage({ type: "LOGIN", username, password });
  loginBtn.disabled = false;
  if (res.ok) {
    showView("main");
    initMainView();
  } else {
    loginError.textContent = res.error || "Login failed";
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await sendMessage({ type: "LOGOUT" });
  showView("login");
});

// ── Add Lead tab ──────────────────────────────────────────────────────────
async function initMainView() {
  toast.hidden = true;

  // Scan page
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      const scan = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" }).catch(() => null);
      if (scan) {
        fields.email.value    = scan.email || "";
        fields.business.value = scan.suggestedBusinessName || "";
        fields.website.value  = scan.website || "";
      }
    }
  } catch (e) {}

  // Pending selection from context menu
  const { pending_selection } = await chrome.storage.local.get("pending_selection");
  if (pending_selection) {
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending_selection);
    if (looksLikeEmail) fields.email.value = pending_selection;
    else fields.name.value = pending_selection;
    await chrome.storage.local.remove("pending_selection");
  }

  // Load campaigns for Add Lead dropdown
  await loadCampaignsIntoSelect(fields.campaign);

  // Campaign stats now live on this first tab
  loadStats();

  // Load unread count for badge
  refreshNotifBadge();
}

async function loadCampaignsIntoSelect(selectEl) {
  selectEl.innerHTML = '<option value="">Loading…</option>';
  const res = await sendMessage({ type: "API_GET", path: "/campaigns" });
  if (res.ok && Array.isArray(res.data)) {
    selectEl.innerHTML = "";
    if (res.data.length === 0) {
      selectEl.innerHTML = '<option value="">No campaigns yet</option>';
    } else {
      for (const c of res.data) {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        selectEl.appendChild(opt);
      }
    }
  } else {
    selectEl.innerHTML = '<option value="">Could not load campaigns</option>';
  }
}

addBtn.addEventListener("click", async () => {
  const email      = fields.email.value.trim();
  const campaignId = fields.campaign.value;
  if (!email)      { showToast(toast, "Email is required", "error"); return; }
  if (!campaignId) { showToast(toast, "Select a campaign", "error"); return; }

  let extraCustomData = {};
  const rawJson = fields.customJson.value.trim();
  if (rawJson) {
    try {
      extraCustomData = JSON.parse(rawJson);
      if (typeof extraCustomData !== "object" || extraCustomData === null || Array.isArray(extraCustomData))
        throw new Error('Must be a JSON object, e.g. {"title": "CEO"}');
    } catch (e) {
      showToast(toast, `Invalid JSON: ${e.message}`, "error");
      return;
    }
  }

  const custom_data = {};
  if (fields.business.value.trim())  custom_data.business_name = fields.business.value.trim();
  if (fields.website.value.trim())   custom_data.website       = fields.website.value.trim();
  if (fields.industry.value.trim())  custom_data.industry      = fields.industry.value.trim();
  Object.assign(custom_data, extraCustomData);

  addBtn.disabled    = true;
  addBtn.textContent = "Adding…";

  const res = await sendMessage({
    type: "API_POST",
    path: `/campaigns/${campaignId}/leads?source=extension`,
    body: [{ email, name: fields.name.value.trim(), custom_data }],
  });

  addBtn.disabled    = false;
  addBtn.textContent = "Add Lead";

  if (res.ok && res.data?.results?.[0]) {
    const status       = res.data.results[0].status;
    const campaignName = fields.campaign.selectedOptions[0]?.textContent || "campaign";
    if (status === "added") {
      showToast(toast, `✅ Added to ${campaignName}`, "success");
      fields.email.value = fields.name.value = fields.customJson.value = "";
    } else if (status === "already_enrolled") {
      showToast(toast, "Already enrolled in this campaign", "error");
    } else if (status === "suppressed") {
      showToast(toast, res.data.results[0].detail || "On suppression list", "error");
    } else {
      showToast(toast, res.data.results[0].detail || "Could not add lead", "error");
    }
  } else {
    showToast(toast, res.data?.detail || res.error || "Request failed", "error");
  }
});

// ── Stats tab ─────────────────────────────────────────────────────────────
let statsData = [];

async function loadStats() {
  const selectEl = document.getElementById("stats-campaign");
  const content  = document.getElementById("stats-content");

  // Load campaign performance data
  content.innerHTML = '<p class="hint">Loading…</p>';
  const res = await sendMessage({ type: "API_GET", path: "/analytics/campaign-performance" });

  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
    selectEl.innerHTML  = '<option value="">No data yet</option>';
    content.innerHTML   = '<p class="hint">No campaigns have sent emails yet.</p>';
    return;
  }

  statsData = res.data;

  selectEl.innerHTML = "";
  for (const c of statsData) {
    const opt = document.createElement("option");
    opt.value = c.campaign_id;
    opt.textContent = c.campaign_name.length > 28 ? c.campaign_name.slice(0, 28) + "…" : c.campaign_name;
    selectEl.appendChild(opt);
  }

  renderStats(statsData[0]);

  selectEl.onchange = () => {
    const row = statsData.find(c => String(c.campaign_id) === selectEl.value);
    if (row) renderStats(row);
  };
}

function renderStats(row) {
  const content = document.getElementById("stats-content");
  content.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Sent</div>
        <div class="kpi-value">${row.sent.toLocaleString()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Opened</div>
        <div class="kpi-value">${row.opened.toLocaleString()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Clicked</div>
        <div class="kpi-value">${row.clicked.toLocaleString()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Replied</div>
        <div class="kpi-value">${row.replied.toLocaleString()}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Open Rate</div>
        <div class="kpi-value accent">${row.open_rate}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Click Rate</div>
        <div class="kpi-value info">${row.click_rate}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Reply Rate</div>
        <div class="kpi-value success">${row.reply_rate}%</div>
      </div>
    </div>
  `;
}

// ── Notifications tab ─────────────────────────────────────────────────────
async function loadNotifications() {
  const list = document.getElementById("notif-list");
  list.innerHTML = '<p class="hint">Loading…</p>';

  const res = await sendMessage({ type: "API_GET", path: "/notifications?limit=15" });
  if (!res.ok || !res.data?.items) {
    list.innerHTML = '<p class="hint">Could not load notifications.</p>';
    return;
  }

  const items = res.data.items;
    const { extSettings = {} } = await chrome.storage.local.get("extSettings");
  const SYSTEM_EVENTS = ['daily_limit', 'rate_limit', 'token_expired', 'feature.error'];
  const filtered = items.filter(n => {
    if (n.event_type === 'email.sent'         && extSettings.showSent         === false) return false;
    if (n.event_type === 'email.opened'       && extSettings.showOpened       === false) return false;
    if (n.event_type === 'email.clicked'      && extSettings.showClicked      === false) return false;
    if (n.event_type === 'lead.replied'       && extSettings.showReplied      === false) return false;
    if (n.event_type === 'lead.unsubscribed'  && extSettings.showUnsubscribed === false) return false;
    if (SYSTEM_EVENTS.includes(n.event_type)  && extSettings.showSystem       === false) return false;
    return true;
  });
  if (filtered.length === 0) {
    list.innerHTML = '<p class="hint">No notifications yet.</p>';
    return;
  }

  list.innerHTML = "";
  for (const n of filtered) {
    const el = document.createElement("div");
    el.className = "notif-item" + (n.read_at ? "" : " unread");
    el.innerHTML = `
      <div class="notif-title">${n.title}</div>
      <div class="notif-meta">
        <span>${timeAgo(n.created_at)}</span>
        ${!n.read_at ? '<span class="new-badge">New</span>' : ""}
      </div>
    `;
    el.addEventListener("click", async () => {
      if (!n.read_at) {
        await sendMessage({ type: "API_PATCH", path: `/notifications/${n.id}/read` });
        el.classList.remove("unread");
        el.querySelector(".new-badge")?.remove();
        refreshNotifBadge();
      }
    });
    list.appendChild(el);
  }

  // update badge
  notifBadge.textContent = res.data.unread || 0;
  notifBadge.hidden      = (res.data.unread || 0) === 0;
}

document.getElementById("mark-all-read-btn").addEventListener("click", async () => {
  await sendMessage({ type: "API_POST", path: "/notifications/read-all", body: {} });
  document.querySelectorAll(".notif-item.unread").forEach(el => {
    el.classList.remove("unread");
    el.querySelector(".new-badge")?.remove();
  });
  notifBadge.hidden = true;
});

async function refreshNotifBadge() {
  const res = await sendMessage({ type: "API_GET", path: "/notifications/unread-count" });
  if (res.ok && res.data) {
    const count        = res.data.unread_count || 0;
    notifBadge.textContent = count;
    notifBadge.hidden      = count === 0;
  }
}

// ── Settings tab ──────────────────────────────────────────────────────────
async function loadSettings() {
  const { extSettings = {} } = await chrome.storage.local.get("extSettings");
  document.getElementById("setting-reply-notif").checked  = extSettings.replyNotif   ?? true;
  document.getElementById("setting-open-notif").checked   = extSettings.openNotif    ?? false;
  document.getElementById("setting-sent-notif").checked   = extSettings.sentNotif    ?? false;
  document.getElementById("setting-click-notif").checked  = extSettings.clickNotif   ?? false;
  document.getElementById("setting-bounce-notif").checked = extSettings.bounceNotif  ?? false;
  document.getElementById("setting-interval").value       = extSettings.interval      ?? "5";
  // Show in list toggles
  document.getElementById("show-sent").checked          = extSettings.showSent         ?? true;
  document.getElementById("show-opened").checked        = extSettings.showOpened       ?? true;
  document.getElementById("show-clicked").checked       = extSettings.showClicked      ?? true;
  document.getElementById("show-replied").checked       = extSettings.showReplied      ?? true;
  document.getElementById("show-unsubscribed").checked  = extSettings.showUnsubscribed ?? true;
  document.getElementById("show-system").checked        = extSettings.showSystem       ?? true;
}

document.getElementById("save-settings-btn").addEventListener("click", async () => {
  const extSettings = {
    replyNotif:        document.getElementById("setting-reply-notif").checked,
    openNotif:         document.getElementById("setting-open-notif").checked,
    sentNotif:         document.getElementById("setting-sent-notif").checked,
    clickNotif:        document.getElementById("setting-click-notif").checked,
    bounceNotif:       document.getElementById("setting-bounce-notif").checked,
    interval:          document.getElementById("setting-interval").value,
    showSent:          document.getElementById("show-sent").checked,
    showOpened:        document.getElementById("show-opened").checked,
    showClicked:       document.getElementById("show-clicked").checked,
    showReplied:       document.getElementById("show-replied").checked,
    showUnsubscribed:  document.getElementById("show-unsubscribed").checked,
    showSystem:        document.getElementById("show-system").checked,
  };
  await chrome.storage.local.set({ extSettings });
  // Tell background to reschedule alarm
  await sendMessage({ type: "UPDATE_SETTINGS", extSettings });
  showToast(document.getElementById("settings-toast"), "Settings saved ✓", "success");
});

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  const auth = await sendMessage({ type: "CHECK_AUTH" });
  if (auth.ok && auth.loggedIn) {
    showView("main");
    await initMainView();
  } else {
    showView("login");
  }
})();
