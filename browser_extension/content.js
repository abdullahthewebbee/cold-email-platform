// InboxAir Quick Lead Capture — content script
// Runs on every page. Scans visible text for an email address and grabs
// basic page metadata (title, domain) so the popup can pre-fill its form.
// Platform-agnostic by design — no site-specific scraping, works anywhere.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function findEmailOnPage() {
  // 1. Prefer a mailto: link if one exists — most reliable signal.
  const mailtoLink = document.querySelector('a[href^="mailto:"]');
  if (mailtoLink) {
    const addr = mailtoLink.href.replace(/^mailto:/i, "").split("?")[0].trim();
    if (EMAIL_RE.test(addr)) return addr;
  }
  // 2. Fall back to scanning visible body text for the first email-looking string.
  const bodyText = document.body ? document.body.innerText : "";
  const match = bodyText.match(EMAIL_RE);
  return match ? match[0] : "";
}

function getPageMeta() {
  const ogSiteName = document.querySelector('meta[property="og:site_name"]');
  const domain = window.location.hostname.replace(/^www\./, "");
  return {
    title: document.title || "",
    domain,
    website: domain,
    suggestedBusinessName: (ogSiteName && ogSiteName.content) || domain,
  };
}

// Respond to the popup asking for the current page's auto-detected info.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCAN_PAGE") {
    sendResponse({
      email: findEmailOnPage(),
      ...getPageMeta(),
    });
  }
  return true;
});