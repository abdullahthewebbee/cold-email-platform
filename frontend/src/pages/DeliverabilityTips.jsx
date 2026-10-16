import { useState } from 'react';
import { RiShieldCheckLine, RiMailSendLine, RiFileTextLine, RiAlertLine, RiCheckLine, RiArrowDownSLine } from '../components/ui/aegisRi';

/* ── data ──────────────────────────────────────────────────────────────── */

const sections = [
  {
    id: 'setup',
    label: 'Before You Send',
    icon: RiShieldCheckLine,
    rules: [
      {
        title: 'Verify your sending domain',
        body: 'Your domain needs four authentication records so mail servers trust your emails. SPF and DKIM are required.',
        tag: 'Required',
      },
      {
        title: 'Use a separate domain for cold outreach',
        body: "Never send cold emails from your main business domain. Use a separate domain or subdomain just for outreach. If something goes wrong — high bounces, spam complaints — only that domain takes the hit. Your main domain stays clean.",
        tag: 'Required',
      },
      {
        title: 'Warm up new inboxes',
        body: 'Any new inbox must be warmed up before sending to real leads. Go to your inbox settings, open the inbox you want, and enable the warm-up toggle. Warming up gradually builds your sending reputation over 2-4 weeks. Skipping this is the most common reason emails land in spam.',
        tag: 'Required',
      },
      {
        title: 'Verify your contact list',
        body: "Always verify your list before launching a campaign. Go to Settings → Features → Email verification and enable it. You can connect MailTester Ninja — it's cheap (under $20) and gives you a very high verification limit — or set up a custom provider. Once enabled, new leads added to any campaign are verified automatically.",
        tag: 'Recommended',
      },
    ],
  },
  {
    id: 'writing',
    label: 'Writing Emails',
    icon: RiFileTextLine,
    rules: [
      {
        title: 'Plain text vs HTML — what you actually need',
        body: "If you are not tracking opens or clicks, send plain text. It looks personal, performs better, and avoids spam filters entirely. If you want to track opens or clicks, your email must be sent as HTML — that's what makes tracking technically possible. But if you're just starting out or sending low volume, plain text and tracking reply rates is more than enough.",
        tag: null,
      },
      {
        title: 'If you do use tracking, keep the first email plain',
        body: 'If you want open or click tracking but still want the best deliverability, send the first email in every sequence as plain text with no tracking. Follow-ups can be HTML with tracking enabled. The first email is what builds the thread — getting that one into the inbox is what matters most.',
        tag: 'Tip',
      },
      {
        title: 'Write like a human',
        body: "Short sentences. Direct point. No buzzwords, no \"I hope this email finds you well.\" Write the way you'd talk to someone in person. Long paragraphs and formal language get skimmed or ignored.",
        tag: null,
      },
      {
        title: 'Personalize beyond the first name',
        body: 'Everyone uses first name. What actually gets replies is something specific — a detail about their business, a recent post they wrote, a challenge their industry faces. The more relevant your email feels to that one person, the better.',
        tag: null,
      },
      {
        title: 'One ask per email',
        body: 'End every email with a single, low-commitment request. Asking someone to book a call, check your site, and reply to a question all at once reduces the chance they do any of it. Pick one.',
        tag: null,
      },
      {
        title: 'No attachments',
        body: 'Attachments on cold emails are a near-guaranteed spam trigger. If you need to share something, link to it.',
        tag: null,
      },
    ],
  },
  {
    id: 'sending',
    label: 'Sending Smart',
    icon: RiMailSendLine,
    rules: [
      {
        title: 'Send during recipient business hours',
        body: "Send emails when your recipient is likely at their desk, not when it's convenient for you. An email that arrives at 3am sits under a pile of others by the time they wake up.",
        tag: null,
      },
      {
        title: '50 emails per inbox per day maximum',
        body: 'Even with a fully warmed inbox, cap at 50 emails per day per mailbox. If you need more volume, add more inboxes rather than pushing one past its limit.',
        tag: null,
      },
      {
        title: 'Space out your sends',
        body: 'Never blast your entire list at once. Spread emails throughout the day with random delays in between. Sending 500 emails in 10 minutes looks like automated bulk mail. Gradual sending looks human.',
        tag: null,
      },
      {
        title: 'Keep sequences to 2-3 emails',
        body: "More follow-ups do not mean more replies. Past the third email, response rates drop and spam complaint rates rise. Respect people's time.",
        tag: null,
      },
    ],
  },
  {
    id: 'reputation',
    label: 'Protecting Your Reputation',
    icon: RiAlertLine,
    rules: [
      {
        title: 'Remove bounced addresses immediately',
        body: "When an address bounces, it means it doesn't exist or can't receive mail. Remove it and never email it again. Keep your bounce rate under 2% — going above this triggers throttling and blocks from major mail providers.",
        tag: 'Critical',
      },
      {
        title: 'Honor every unsubscribe',
        body: 'Anyone who asks to stop receiving emails — whether they click unsubscribe or reply with "stop" or "remove me" — must be permanently removed from all campaigns. This is both a spam trigger and a legal requirement under CAN-SPAM, GDPR, and most other email laws. No exceptions.',
        tag: 'Critical',
      },
      {
        title: 'Track replies, not opens',
        body: 'Reply rate is a real signal — someone actually responded. Open rates are unreliable because many apps count an open the moment an email arrives. Use reply rate as your main performance metric and compare it to industry benchmarks.',
        tag: null,
      },
    ],
  },
];

const metrics = [
  { label: 'Bounce rate',             safe: 'Under 2%',   danger: 'Above 3%' },
  { label: 'Spam complaint rate',     safe: 'Under 0.1%', danger: 'Above 0.3%' },
  { label: 'Emails per inbox / day',  safe: 'Up to 50',   danger: 'Above 50' },
  { label: 'Follow-ups per sequence', safe: '2-3 emails', danger: '4+ emails' },
  { label: 'Warm-up period',          safe: '2-4 weeks',  danger: 'Skipping it' },
];

/* ── scoped styles ─────────────────────────────────────────────────────── */
const CSS = `
.dt-hero {
  background: var(--gold-dim);
  padding: 2rem 2rem 1.75rem;
}
.dt-hero-eyebrow {
  font-family: var(--font-ui);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 0.4rem;
}
.dt-hero-title {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 0.3rem;
}
.dt-hero-sub {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0 0 1.25rem;
}
.dt-tab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.dt-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.35rem 0.85rem;
  border-radius: 0.35rem;
  border: 1px solid var(--border);
  background: var(--gold-hover);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.dt-tab-btn:hover { background: var(--gold-dim); color: var(--text); }
.dt-tab-btn.active {
  background: var(--do-gold);
  border-color: var(--do-gold);
  color: var(--on-gold);
  font-weight: 700;
}
.dt-content {
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.75rem 2rem 3rem;
}
.dt-rule {
  border: 1px solid var(--do-border);
  border-radius: 0.5rem;
  background: var(--do-surface);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  margin-bottom: 0.5rem;
  overflow: hidden;
}
.dt-rule:hover { border-color: var(--do-gold); background: var(--do-cream); }
.dt-rule.open  { border-color: var(--do-gold); background: var(--do-cream); }
.dt-rule-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
}
.dt-rule-num {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--do-gold);
  width: 1.5rem;
  flex-shrink: 0;
  text-align: right;
}
.dt-rule-title {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.5rem;
}
.dt-rule-title-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--do-text);
  line-height: 1.4;
}
.dt-chevron {
  flex-shrink: 0;
  color: var(--do-text-muted);
  line-height: 0;
  transition: transform 0.25s;
}
.dt-chevron.open { transform: rotate(180deg); }
.dt-rule-body-wrap {
  display: grid;
  transition: grid-template-rows 0.28s ease;
}
.dt-rule-body-wrap.open  { grid-template-rows: 1fr; }
.dt-rule-body-wrap.closed { grid-template-rows: 0fr; }
.dt-rule-body-inner { overflow: hidden; }
.dt-rule-body {
  padding: 0.75rem 1rem 1rem 3.25rem;
  font-size: 0.82rem;
  color: var(--do-text-muted);
  line-height: 1.65;
  border-top: 1px solid var(--do-border);
}
.dt-tag {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.1rem 0.45rem;
  border-radius: 0.25rem;
  white-space: nowrap;
  flex-shrink: 0;
}
.dt-tag-required    { background: var(--danger-dim); color: var(--danger); border: 1px solid var(--danger-line); }
.dt-tag-critical    { background: var(--danger-dim); color: var(--danger); border: 1px solid var(--danger-line); }
.dt-tag-recommended { background: var(--warning-dim); color: var(--warning); border: 1px solid var(--warning-line); }
.dt-tag-tip         { background: var(--do-gold-bg); color: var(--do-gold-dark); border: 1px solid var(--do-gold); }
.dt-table-wrap {
  border: 1px solid var(--do-border);
  border-radius: 0.5rem;
  overflow: hidden;
  margin-top: 0.75rem;
}
.dt-table-head {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: var(--do-cream);
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--do-border);
}
.dt-table-head-cell {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--do-text-muted);
}
.dt-table-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 0.6rem 1rem;
  font-size: 0.8rem;
  border-bottom: 1px solid var(--do-border);
  align-items: center;
}
.dt-table-row:last-child { border-bottom: none; }
.dt-table-row:nth-child(even) { background: var(--do-cream); }
.dt-table-metric { font-weight: 600; color: var(--do-text); }
.dt-table-safe   { display: flex; align-items: center; gap: 0.3rem; color: var(--success); font-weight: 500; }
.dt-table-danger { display: flex; align-items: center; gap: 0.3rem; color: var(--danger); font-weight: 500; }
.dt-section-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--do-text);
  margin: 0 0 0.75rem;
}
`;

/* ── Tag ───────────────────────────────────────────────────────────────── */

function Tag({ label }) {
  if (!label) return null;
  const cls = {
    Required: 'dt-tag-required',
    Critical: 'dt-tag-critical',
    Recommended: 'dt-tag-recommended',
    Tip: 'dt-tag-tip',
  }[label];
  if (!cls) return null;
  return <span className={`dt-tag ${cls}`}>{label}</span>;
}

/* ── Rule accordion ────────────────────────────────────────────────────── */

function Rule({ rule, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`dt-rule ${open ? 'open' : ''}`} onClick={() => setOpen(v => !v)}>
      <div className="dt-rule-head">
        <span className="dt-rule-num">{String(index + 1).padStart(2, '0')}</span>
        <div className="dt-rule-title">
          <span className="dt-rule-title-text">{rule.title}</span>
          <Tag label={rule.tag} />
        </div>
        <span className={`dt-chevron ${open ? 'open' : ''}`}>
          <RiArrowDownSLine size={18} />
        </span>
      </div>
      <div className={`dt-rule-body-wrap ${open ? 'open' : 'closed'}`}>
        <div className="dt-rule-body-inner">
          <p className="dt-rule-body">{rule.body}</p>
        </div>
      </div>
    </div>
  );
}

/* ── main ──────────────────────────────────────────────────────────────── */

export default function DeliverabilityTips() {
  const [activeSection, setActiveSection] = useState('setup');
  const section = sections.find(s => s.id === activeSection);

  const sectionOffsets = {};
  let globalIndex = 0;
  sections.forEach(s => {
    sectionOffsets[s.id] = globalIndex;
    globalIndex += s.rules.length;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <style>{CSS}</style>

      {/* Hero */}
      <div className="dt-hero">
        <div className="dt-hero-eyebrow">InboxAir / Guide</div>
        <h1 className="dt-hero-title">Deliverability Tips</h1>
        <p className="dt-hero-sub">Best practices for landing in the inbox, getting read, and protecting your sender reputation.</p>
        <nav className="dt-tab-row">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className={`dt-tab-btn ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <Icon size={14} />
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="dt-content">
        {/* Rules */}
        <div style={{ marginBottom: '2.5rem' }}>
          {section.rules.map((rule, i) => (
            <Rule key={rule.title} rule={rule} index={sectionOffsets[activeSection] + i} />
          ))}
        </div>

        {/* Quick reference table */}
        <div>
          <h2 className="dt-section-title">Quick Reference</h2>
          <div className="dt-table-wrap">
            <div className="dt-table-head">
              {['Metric', 'Safe zone', 'Danger zone'].map(h => (
                <span key={h} className="dt-table-head-cell">{h}</span>
              ))}
            </div>
            {metrics.map(m => (
              <div key={m.label} className="dt-table-row">
                <span className="dt-table-metric">{m.label}</span>
                <span className="dt-table-safe">
                  <RiCheckLine size={13} style={{ flexShrink: 0 }} />{m.safe}
                </span>
                <span className="dt-table-danger">
                  <RiAlertLine size={13} style={{ flexShrink: 0 }} />{m.danger}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}