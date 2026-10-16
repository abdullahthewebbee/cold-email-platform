import { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { RiMailLine, RiSendPlaneLine, RiUserLine, RiCalendarScheduleLine, RiBarChartLine, RiShieldCheckLine, RiRocketLine, RiArrowLeftLine, RiArrowRightLine, RiCloseLine, RiCheckLine, RiAddLine, RiSubtractLine, RiLightbulbLine, RiAlertLine, RiGlobalLine, RiPlugLine, RiTeamLine, RiBellLine, RiLockLine } from './ui/aegisRi';


/* ── Expandable detail block ─────────────────────────────────────────── */
function ToggleDetail({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ob-detail${open ? ' open' : ''}`}>
      <button type="button" className="ob-detail-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{title}</span>
        {open ? <RiSubtractLine size={16} /> : <RiAddLine size={16} />}
      </button>
      {open && <div className="ob-detail-body">{children}</div>}
    </div>
  );
}

/* ── step definitions ────────────────────────────────────────────────── */
const steps = [
  {
    id: 'welcome',
    icon: <RiRocketLine size={36} />,
    title: 'Welcome to InboxAir',
    subtitle: 'Your complete cold email outreach platform',
    description: 'InboxAir automates your entire cold email workflow — from lead import to reply management — using your own Gmail, Office 365, or SMTP accounts. This tour covers every feature so you can start sending confidently.',
    highlights: [
      'Send multi-step personalized sequences automatically',
      'Track opens, clicks, and replies in real-time',
      'Manage unlimited Gmail, O365 and SMTP inboxes',
      'A/B test subject lines and email copy',
      'Built-in deliverability tools to stay out of spam',
      'Browser extension to capture leads from any webpage',
    ],
    tip: 'Use Test mode (Settings → Dev) to simulate the full workflow without sending real emails.',
    details: [],
  },
  {
    id: 'inboxes',
    icon: <RiMailLine size={36} />,
    title: 'Connect Your Accounts',
    subtitle: 'Gmail, Office 365, or SMTP — all supported',
    description: 'Connect one or more sending accounts. Each inbox has its own daily sending cap, warmup schedule, and wait-time between emails. InboxAir respects all these limits automatically.',
    highlights: [
      'Gmail — connect via Google OAuth (one click)',
      'Office 365 — connect via Microsoft OAuth',
      'Universal SMTP — any provider (Postmark, SendGrid, etc.)',
      'Per-inbox daily sending limit (e.g. 30–50/day to start)',
      'Ramp-up mode — auto-increase daily limit over time',
      'Custom tracking domain per inbox for better deliverability',
    ],
    tip: 'Start new Gmail accounts at 20 emails/day. Increase by 5–10 per week. Never jump straight to 100+.',
    details: [
      {
        title: 'How to connect Gmail',
        content: 'Go to Accounts → Add account → Select Gmail → Sign in with Google → Grant permissions. Done. InboxAir will verify the connection and show a green status.',
      },
      {
        title: 'What is Ramp-Up Mode?',
        content: 'Ramp-up gradually increases your daily sending limit over time. Enable it on new accounts to build sender reputation. Set a start limit (e.g. 10/day), a target limit (e.g. 80/day), and a step size (e.g. +5/day each week). InboxAir handles the rest automatically.',
      },
      {
        title: 'Tracking options explained',
        content: '• App domain: tracking links go through your own server URL.\n• Beacon: a separate lightweight proxy server you self-host — best for production.\n• Custom DNS: your own branded domain (e.g. track.yourdomain.com) — most professional.',
      },
      {
        title: 'Wait time between emails',
        content: 'Sets the minimum gap between sends from one inbox. Example: 5 minutes between emails makes sending look human, not robotic. Recommended: 3–8 minutes for cold outreach.',
      },
    ],
  },
  {
    id: 'campaigns',
    icon: <RiSendPlaneLine size={36} />,
    title: 'Create Campaigns',
    subtitle: 'Multi-step sequences with branches, A/B tests & personalization',
    description: 'A campaign is a series of emails sent automatically to your leads. Build simple linear sequences, or advanced branch-tree sequences that adapt based on whether a lead opens or clicks.',
    highlights: [
      'Multi-step sequences — initial + follow-ups with wait days',
      'Branch-tree builder — if opened → path A, if not → path B',
      'A/B variants — test different subject lines and body copy',
      'Personalized sequences — custom email per lead using AI',
      'Template variables: {{name}}, {{company}}, {{custom_field}}',
      'Sending window — choose days and hours per campaign',
    ],
    tip: 'Keep sequences to 3–4 steps. Most replies come from email 1 or 2. More steps = diminishing returns.',
    details: [
      {
        title: 'Standard sequence vs Branch-tree',
        content: 'Standard: every lead gets the same email order (Step 1 → Step 2 → Step 3).\nBranch-tree: lead opened Step 1? → send Step 2A. Did not open? → send Step 2B (a softer follow-up). This dramatically improves reply rates by adapting to behaviour.',
      },
      {
        title: 'How to use template variables',
        content: 'Add {{name}}, {{company}}, {{title}}, or any custom field from your lead data. Example: "Hi {{name}}, I noticed {{company}} is hiring for..." — InboxAir fills these in automatically from each lead\'s data when the email is sent.',
      },
      {
        title: 'A/B testing explained',
        content: 'Create multiple variants of one sequence step. InboxAir randomly assigns each lead to a variant and tracks which gets more opens/replies. After enough data, pick the winner and remove the others.',
      },
      {
        title: 'Complaint Rate Guardrail',
        content: 'Set a maximum allowed complaint/unsubscribe rate per campaign. If the rate exceeds your threshold, InboxAir automatically pauses the campaign and sends you a notification. Prevents domain reputation damage.',
      },
    ],
  },
  {
    id: 'leads',
    icon: <RiUserLine size={36} />,
    title: 'Add & Manage Contacts',
    subtitle: 'Excel import, bulk paste, one-by-one, or via browser extension',
    description: 'Contacts are the people you want to reach. Add them in bulk via Excel, paste a list of emails, add one at a time, or capture them from any webpage using the browser extension.',
    highlights: [
      'Excel/CSV import — map columns to lead fields',
      'Bulk paste — paste a list of emails directly',
      'Individual add — fill a quick form per lead',
      'Browser extension — capture from LinkedIn, Apollo, Clutch, any site',
      'Custom data fields — any key/value you need (title, city, budget…)',
      'Email verification before sending — catch invalid addresses early',
    ],
    tip: 'Always run email verification before sending to large lists. One hard bounce per 100 emails can hurt your domain reputation.',
    details: [
      {
        title: 'How Excel import works',
        content: 'Go to Contacts → Import (or a campaign\'s Leads tab → Import). Upload your .xlsx or .csv file. Map your columns (email, name, company, etc.) to InboxAir fields. Use the "Additional custom data (JSON)" column for any extra fields like {"title":"CEO","budget":"$5k"}. InboxAir creates or updates each lead and enrolls them.',
      },
      {
        title: 'Custom data fields',
        content: 'Any extra information about a lead goes in custom_data as JSON. Example: {"industry":"SaaS","pain_point":"No pipeline"}. Use these in your email templates with {{industry}}, {{pain_point}}. The more specific your data, the more personalized your emails.',
      },
      {
        title: 'Lead statuses explained',
        content: '• Active: enrolled, will receive emails\n• Contacted: first email sent\n• Completed: all sequence steps sent\n• Replied: lead replied (stop-on-reply will pause further sends)\n• Bounced: email address is invalid (no more sends)\n• Unsubscribed: clicked unsubscribe link\n• Needs custom email: personalized sequence waiting for AI draft',
      },
      {
        title: 'Global blocklist',
        content: 'Add emails to the Blocklist (sidebar → Blocklist) to permanently block them from ever being enrolled in any campaign. Any lead on this list is silently skipped on import. Use for unsubscribes, competitors, and personal contacts.',
      },
    ],
  },
  {
    id: 'extension',
    icon: <RiPlugLine size={36} />,
    title: 'Browser Extension',
    subtitle: 'Capture leads from any webpage in one click',
    description: 'The InboxAir Chrome extension lets you add leads directly from any website — Apollo, Clutch, a company\'s About page, Google Maps listings — without opening the app. Auto-detects emails and company info.',
    highlights: [
      'Click the extension icon on any page to open the quick-add form',
      'Auto-detects email addresses visible on the page',
      'Auto-fills company name and website from page metadata',
      'Add custom JSON fields (title, budget, pain points), pick the target campaign',
      'Right-click any selected text → "Add as InboxAir lead"',
      'Notifications tab — see replies, opens and clicks without opening the app',
      'Campaign stats at a glance inside the popup',
    ],
    tip: 'Use the right-click → "Add as InboxAir lead" feature when you spot an email address on any page.',
    details: [
      {
        title: 'How to install the extension',
        content: '1. Open Chrome → go to chrome://extensions\n2. Enable Developer Mode (top right)\n3. Click "Load unpacked"\n4. Select the browser_extension/ folder from the InboxAir project\n5. Click the InboxAir icon in your toolbar and log in with your account.',
      },
      {
        title: 'What gets auto-detected?',
        content: 'The extension scans the current page for: mailto: links (most reliable), email-pattern text in the page body, the page title and og:site_name for company name, and the domain as the website. Auto-detected values pre-fill the form — you can edit any of them before submitting.',
      },
    ],
  },
  {
    id: 'scheduling',
    icon: <RiCalendarScheduleLine size={36} />,
    title: 'Smart Scheduling',
    subtitle: 'Automatic queue engine — no manual scheduling needed',
    description: 'InboxAir\'s queue engine automatically calculates when to send each email based on your inbox limits, campaign priority, sending windows, and ramp-up schedules. View and manage upcoming sends on the Queue page.',
    highlights: [
      'Priority mode — drag campaigns to set which sends first',
      'Round-robin mode — distribute sends evenly across campaigns',
      'Respects daily inbox limits and ramp-up schedules',
      'Timezone-aware — send in the recipient\'s local time',
      'Exact-second precision — sends fire at the scheduled moment',
      'Distributed workers — no duplicate sends even if scaled',
    ],
    tip: 'Use Priority mode when you have a time-sensitive campaign. Drag it to the top of the priority list.',
    details: [
      {
        title: 'Priority vs Round-robin',
        content: 'Priority: fills your inbox\'s daily quota with the highest-priority campaign first, then moves to the next. Good when one campaign is more urgent.\nRound-robin: distributes slots evenly across all campaigns. Good when all campaigns are equally important.',
      },
      {
        title: 'How the queue works',
        content: 'Every minute, the scanner checks for slots due in the next 60 seconds. Each slot is locked in Redis (preventing duplicates), then sent to a background worker. The worker checks quota, rate limits, sending window, and stop-on-reply before firing. All of this happens automatically.',
      },
      {
        title: 'Sending window',
        content: 'Set which days of the week and which hours (in your campaign\'s timezone) emails should go out. Example: Monday–Friday, 9am–5pm EST. Slots outside the window are skipped and rescheduled. This makes your sending look natural.',
      },
    ],
  },
  {
    id: 'deliverability',
    icon: <RiShieldCheckLine size={36} />,
    title: 'Deliverability Suite',
    subtitle: 'DNS Doctor, Spam Score, Health Score & more',
    description: 'InboxAir includes a full deliverability toolkit. Check your domain setup, score your email content before sending, monitor your reputation over time, and get alerted before problems become serious.',
    highlights: [
      'Deliverability page — DNS Doctor checks SPF, DKIM, DMARC, blacklists in one click',
      'Spam Score Pre-Check — live warning in the sequence editor',
      'Deliverability Health Score — 0–100 score per sending domain',
      'Domain Reputation Timeline — bounce/open/click trends over time',
      'Send Autopsy — auth snapshot + content risk per sent email',
      'Complaint Rate Guardrail — auto-pause campaigns on high complaint rate',
    ],
    tip: 'Run the Deliverability check on every new sending domain before starting a campaign. Fix any red items first.',
    details: [
      {
        title: 'DNS Doctor explained',
        content: 'Checks your domain\'s: SPF record (authorizes your server to send), DKIM (cryptographic signature on every email), DMARC (policy for handling failures), blacklists (whether your domain/IP is blocked), MTA-STS, TLS-RPT, DNSSEC, and BIMI. Each check gets pass/warn/fail with exact fixes shown.',
      },
      {
        title: 'Deliverability Health Score',
        content: 'A 0–100 score combining three things:\n• DNS score (60%) — from DNS Doctor\n• Auth pass rate (25%) — % of your recent sends where SPF+DMARC both passed\n• Content safety (15%) — inverse of average spam-phrase risk in your sent emails\nScore updates automatically as you send. Find it on the Deliverability page.',
      },
      {
        title: 'Spam Score Pre-Check',
        content: 'While writing your email sequence, InboxAir scans your subject line and body in real time for spam-trigger phrases ("FREE", "ACT NOW", excessive punctuation, etc.) and shows a live risk score. Fix flagged phrases before activating the campaign.',
      },
      {
        title: 'Send Autopsy',
        content: 'Every sent email records: was SPF set up? was DMARC policy reject/quarantine? content risk score and which phrases triggered it. View these per email in the Sent Emails panel inside each campaign. Useful for diagnosing deliverability drops.',
      },
    ],
  },
  {
    id: 'analytics',
    icon: <RiBarChartLine size={36} />,
    title: 'Analytics & Inbox',
    subtitle: 'Track performance and manage replies in one place',
    description: 'Analytics shows campaign-level performance over time. Inbox (Unibox) is your unified inbox — all replies from all Gmail/O365 accounts appear here, threaded and searchable, with AI reply drafting.',
    highlights: [
      'Analytics — timeline charts: sends, opens, clicks, replies per day',
      'Per-campaign breakdown — compare campaigns side by side',
      'Domain Reputation Timeline — spot deliverability trends early',
      'Inbox — all replies from all accounts in one place',
      'AI Reply Draft — one click to generate a reply suggestion',
      'Reply interest classifier — auto-labels replies (interested, OOO, not interested)',
    ],
    tip: 'Check Analytics weekly. A drop in open rate usually means deliverability issues — open Deliverability and run DNS Doctor immediately.',
    details: [
      {
        title: 'How the Inbox works',
        content: 'The Inbox syncs Gmail and O365 inboxes every 5 minutes and shows all replies in one view. Filter by inbox, campaign, or lead. Click any thread to read the full conversation, draft a reply, or mark interest. It does NOT replace your Gmail inbox — it is a read/reply layer on top of it.',
      },
      {
        title: 'AI Reply Draft',
        content: 'Open any Inbox thread → click the ✨ AI draft button. InboxAir reads the conversation context and generates a suggested reply. Review and edit before sending. Requires an AI provider (OpenAI/Anthropic) configured in Settings.',
      },
      {
        title: 'Reply interest classifier',
        content: 'InboxAir reads incoming replies and classifies them as: Interested, Not Interested, Out of Office, Auto-reply, or Meeting booked. These labels appear on contacts and in the Inbox. You can filter leads by interest status to prioritize follow-ups.',
      },
    ],
  },
  {
    id: 'integrations',
    icon: <RiGlobalLine size={36} />,
    title: 'Integrations & Backup',
    subtitle: 'API keys, webhooks, MCP and safe backups',
    description: 'Connect InboxAir to the rest of your stack and keep your data safe. Everything lives in Settings, grouped by the tabs along the top.',
    highlights: [
      'API keys — create keys to script InboxAir from your own tools',
      'Webhooks — push events to Zapier, Make or your CRM',
      'MCP — connect AI assistants (Cursor, Claude) to your account',
      'Gmail sync — control how replies are pulled into the Inbox',
      'Backup & restore — export your data and restore it when needed',
      'Plan & Subscription — manage billing under the Billing tab',
    ],
    tip: 'Download a backup before bulk deletes or big imports, so you can always roll back.',
    details: [
      {
        title: 'Using the MCP integration',
        content: 'Open Settings → Integrating → MCP, copy the ready-made config snippet and paste it into your AI client. It uses one of your API keys, so create a key first.',
      },
      {
        title: 'Backup & restore',
        content: 'Settings → Setup → Backup & restore lets you download a backup of your workspace and restore it later. After a restore the app reloads to pick up the restored data.',
      },
    ],
  },
  {
    id: 'notifications',
    icon: <RiBellLine size={36} />,
    title: 'Notifications & Support',
    subtitle: 'Stay informed without checking constantly',
    description: 'InboxAir sends in-app notifications for important events — bounces, replies, daily limit hits, OAuth token expiry, and more. The Crisp live chat widget lets you reach support without leaving the app.',
    highlights: [
      'Bell icon — in-app notification center, real-time badge',
      'Lead replied — notified instantly when a lead responds',
      'Email bounced — notified when an address is invalid',
      'Daily limit hit — notified when an inbox quota is reached',
      'Token expired — notified when Gmail/O365 OAuth needs reconnection',
      'Crisp live chat — click the chat bubble (bottom right) for support',
    ],
    tip: 'Open the Notifications page to review every event, and enable email alerts in Settings so nothing important is missed.',
    details: [
      {
        title: 'Webhook notifications',
        content: 'Go to Settings → Integrating → Webhooks to send event data to any external URL (Zapier, Make, your own server). Supported events: email.sent, email.opened, email.clicked, lead.replied, email.bounced, daily_limit, token_expired, and more. Great for connecting InboxAir to your CRM.',
      },
      {
        title: 'Audit log',
        content: 'Every important action in your account is logged: login, team member invited, campaign created, inbox connected, webhook created. Admins can also read it via the API at /api/audit-log. Useful for security reviews and compliance.',
      },
    ],
  },
  {
    id: 'team',
    icon: <RiTeamLine size={36} />,
    title: 'Team & Security',
    subtitle: 'Roles, permissions, and account security',
    description: 'Invite team members with appropriate roles. InboxAir supports Owner, Admin, User, and Read-only roles. All data is scoped to your organization — team members can only see your org\'s campaigns and leads.',
    highlights: [
      'Owner — full access, can delete the organization',
      'Admin — manage team, inboxes, campaigns, settings',
      'User — create and manage campaigns and leads',
      'Read-only — view everything, change nothing',
      'Invite by email — team member sets their own password',
      'Multi-tenant isolation — each org\'s data is fully separated',
    ],
    tip: 'Assign Read-only to clients or stakeholders who need to see campaign results but should not make changes.',
    details: [
      {
        title: 'How to invite a team member',
        content: 'Go to Settings → General → Invite Team. Enter their email and choose a role. They receive an invitation email with a link to set up their account. The link expires in 7 days.',
      },
      {
        title: 'Login security',
        content: 'InboxAir supports username/password login and Google/Microsoft OAuth (sign in with Google). OAuth is recommended — no password to remember or leak. All tokens are JWT-based with 30-minute expiry and automatic refresh.',
      },
    ],
  },
];

/* ── styles (scoped, Aegis look) ─────────────────────────────────────── */
const OB_CSS = `
.ob-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(26,22,16,.45);backdrop-filter:blur(3px);outline:none}
.ob-modal{position:relative;width:100%;max-width:600px;max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:var(--surface,#fff);border:1px solid var(--border);border-radius:20px;box-shadow:0 24px 60px rgba(26,22,16,.28);overflow:hidden}
.ob-close{position:absolute;top:16px;right:16px;z-index:2;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:transparent;color:var(--text-muted);cursor:pointer}
.ob-close:hover{background:var(--badge-bg-gold);color:var(--gold-dark)}
.ob-scroll{flex:1;min-height:0;overflow-y:auto;padding:28px 32px 20px}
.ob-brand{text-align:center;font-family:var(--font-display,'Spectral',serif);font-size:22px;font-weight:600;color:var(--gold-dark);margin:0 0 16px}
.ob-step{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px}
.ob-hero{display:flex;align-items:center;gap:16px;padding:18px 20px;margin-bottom:18px;border-radius:14px;background:linear-gradient(135deg,#c9a85c,#a8843f);color:#fff}
.ob-hero-ico{flex:none;width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(255,255,255,.2)}
.ob-hero h2{margin:0;font-family:var(--font-display,'Spectral',serif);font-size:21px;font-weight:600;line-height:1.2;color:#fff}
.ob-hero p{margin:4px 0 0;font-size:12.5px;line-height:1.4;color:rgba(255,255,255,.88)}
.ob-desc{margin:0 0 16px;font-size:14px;line-height:1.6;color:var(--text-muted)}
.ob-list{list-style:none;margin:0 0 18px;padding:0;display:flex;flex-direction:column;gap:10px}
.ob-list li{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;line-height:1.45;color:var(--text)}
.ob-check{flex:none;width:18px;height:18px;margin-top:1px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(--gold-dark);color:#fff}
.ob-details{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}
.ob-detail{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface,#fff)}
.ob-detail-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border:0;background:var(--bg);color:var(--text);font:600 13px/1.3 inherit;font-family:inherit;text-align:left;cursor:pointer}
.ob-detail-btn:hover{background:var(--badge-bg-gold);color:var(--gold-dark)}
.ob-detail-btn svg{flex:none;color:var(--gold-dark)}
.ob-detail-body{padding:12px 14px;border-top:1px solid var(--border);font-size:13px;line-height:1.6;color:var(--text-muted);white-space:pre-line}
.ob-tip{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:10px;background:var(--badge-bg-gold);border:1px solid var(--border);font-size:12.5px;line-height:1.5;color:var(--text)}
.ob-tip svg{flex:none;margin-top:2px;color:var(--gold-dark)}
.ob-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 32px;background:var(--bg);border-top:1px solid var(--border)}
.ob-dots{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ob-dot{height:8px;width:8px;padding:0;border:0;border-radius:99px;background:var(--border);cursor:pointer;transition:all .2s}
.ob-dot:hover{background:var(--text-muted)}
.ob-dot.done{background:#cdb178}
.ob-dot.on{width:24px;background:var(--gold-dark)}
.ob-actions{display:flex;align-items:center;gap:8px;flex:none}
.ob-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;border:0;font:600 13.5px/1 inherit;font-family:inherit;cursor:pointer}
.ob-btn.ghost{background:transparent;color:var(--text-muted)}
.ob-btn.ghost:hover{background:var(--badge-bg-gold);color:var(--gold-dark)}
.ob-btn.primary{background:var(--gold-dark);color:#fff;padding:10px 20px}
.ob-btn.primary:hover{filter:brightness(.93)}
@media(max-width:560px){.ob-overlay{padding:12px}.ob-scroll{padding:22px 20px 16px}.ob-foot{padding:14px 20px;flex-direction:column;align-items:stretch}.ob-actions{justify-content:flex-end}}
`;

/* ── step card ───────────────────────────────────────────────────────── */
function StepCard({ step }) {
  return (
    <div>
      <div className="ob-hero">
        <div className="ob-hero-ico">{step.icon}</div>
        <div>
          <h2>{step.title}</h2>
          <p>{step.subtitle}</p>
        </div>
      </div>

      <p className="ob-desc">{step.description}</p>

      <ul className="ob-list">
        {step.highlights.map((h, i) => (
          <li key={i}>
            <span className="ob-check"><RiCheckLine size={11} /></span>
            <span>{h}</span>
          </li>
        ))}
      </ul>

      {step.details && step.details.length > 0 && (
        <div className="ob-details">
          {step.details.map((d, i) => (
            <ToggleDetail key={i} title={d.title}>{d.content}</ToggleDetail>
          ))}
        </div>
      )}

      {step.tip && (
        <div className="ob-tip">
          <RiLightbulbLine size={15} />
          <span><strong>Tip:</strong> {step.tip}</span>
        </div>
      )}
    </div>
  );
}

/* ── dots ────────────────────────────────────────────────────────────── */
function StepDots({ current, total, onDotClick }) {
  return (
    <div className="ob-dots">
      {Array.from({ length: total }, (_, i) => (
        <button key={i} type="button" onClick={() => onDotClick(i)}
          className={`ob-dot${i === current ? ' on' : i < current ? ' done' : ''}`}
          aria-label={`Step ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────────────── */
export default function Onboarding() {
  const { showOnboarding, completeOnboarding } = useOnboarding();
  const [current, setCurrent] = useState(0);

  useEffect(() => { if (showOnboarding) setCurrent(0); }, [showOnboarding]);

  if (!showOnboarding) return null;

  const isFirst = current === 0;
  const isLast = current === steps.length - 1;
  const goNext = () => isLast ? completeOnboarding() : setCurrent(c => c + 1);
  const goPrev = () => !isFirst && setCurrent(c => c - 1);
  const goTo = (i) => setCurrent(i);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
    else if (e.key === 'ArrowLeft') goPrev();
    else if (e.key === 'Escape') completeOnboarding();
  };

  return (
    <div className="ob-overlay" onKeyDown={handleKeyDown} tabIndex={0} role="dialog" aria-modal="true" aria-label="Onboarding wizard">
      <style>{OB_CSS}</style>
      <div className="ob-modal">
        <button type="button" className="ob-close" onClick={completeOnboarding} aria-label="Close">
          <RiCloseLine size={20} />
        </button>

        <div className="ob-scroll">
          {isFirst && <div className="ob-brand">InboxAir</div>}
          <div className="ob-step">Step {current + 1} of {steps.length}</div>
          <StepCard key={steps[current].id} step={steps[current]} />
        </div>

        <div className="ob-foot">
          <StepDots current={current} total={steps.length} onDotClick={goTo} />
          <div className="ob-actions">
            {!isFirst && (
              <button type="button" onClick={goPrev} className="ob-btn ghost"><RiArrowLeftLine size={15} /> Back</button>
            )}
            {isFirst && (
              <button type="button" onClick={completeOnboarding} className="ob-btn ghost">Skip tour</button>
            )}
            <button type="button" onClick={goNext} className="ob-btn primary">
              {isLast ? (<>Get Started <RiRocketLine size={15} /></>) : (<>Next <RiArrowRightLine size={15} /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
