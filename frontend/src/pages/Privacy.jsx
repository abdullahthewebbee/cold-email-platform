// NOTE: This file inlines the LegalLayout, H2, P, and UL helpers so the
// visual redesign is self-contained. If your project's LegalLayout is already
// styled to the design system, you can revert to importing those helpers and
// only keep the link colour changes (text-teal-600 → lo-link style below).

const css = `
.lg-page {
  min-height: 100vh;
  background: var(--do-gold-bg);
  font-family: ui-sans-serif, system-ui, sans-serif;
  color: var(--do-text);
  padding: 3rem 1rem 5rem;
}
.lg-inner {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Header ── */
.lg-header {
  background: var(--gold-dim);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 2rem 2.25rem 1.75rem;
  margin-bottom: 2.25rem;
  color: var(--text);
}
.lg-eyebrow {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 0.5rem;
}
.lg-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  line-height: 1.15;
  color: var(--text);
}
.lg-updated {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

/* ── Body card ── */
.lg-body {
  background: var(--do-cream);
  border: 1.5px solid var(--do-border);
  border-radius: 12px;
  padding: 2rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Typography ── */
.lg-h2 {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--do-text);
  margin: 1.75rem 0 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--do-border);
  text-wrap: balance;
}
.lg-h2:first-child { margin-top: 0; }
.lg-p {
  font-size: 0.88rem;
  line-height: 1.7;
  color: var(--do-text);
  margin: 0.5rem 0 0;
}
.lg-ul {
  margin: 0.5rem 0 0 1.1rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.lg-ul li {
  font-size: 0.88rem;
  line-height: 1.65;
  color: var(--do-text);
}
.lg-ul li::marker { color: var(--do-gold); }
.lg-link {
  color: var(--do-gold-dark);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lg-link:hover { color: var(--do-gold); }

@media (max-width: 520px) {
  .lg-header { padding: 1.5rem 1.25rem 1.25rem; }
  .lg-body   { padding: 1.5rem 1.25rem; }
  .lg-title  { font-size: 1.5rem; }
}
`;

function H2({ children }) {
  return <h2 className="lg-h2">{children}</h2>;
}
function P({ children }) {
  return <p className="lg-p">{children}</p>;
}
function UL({ children }) {
  return <ul className="lg-ul">{children}</ul>;
}

const updated = new Date().toISOString().split('T')[0];

export default function Privacy() {
  return (
    <>
      <style>{css}</style>
      <div className="lg-page">
        <div className="lg-inner">

          {/* ── Header ── */}
          <div className="lg-header">
            <p className="lg-eyebrow">InboxAir · Legal</p>
            <h1 className="lg-title">Privacy Policy</h1>
            <p className="lg-updated">Last updated: {updated}</p>
          </div>

          {/* ── Body ── */}
          <div className="lg-body">

            <P>This Privacy Policy explains how Devlet Tech ("we," "us," "our") collects, uses, and protects information through InboxAir (the "Service"). It applies to two different groups of people:</P>
            <UL>
              <li><strong>Customers</strong> — the people and businesses who sign up for and use InboxAir to run cold email campaigns.</li>
              <li><strong>Leads / recipients</strong> — the people our Customers email through the Service. We process this data on their behalf.</li>
            </UL>
            <P><strong>Important distinction:</strong> For lead/recipient data, our Customer is the data controller and Devlet Tech is the data processor. If you are a lead who received an email sent through InboxAir and want to exercise a data privacy right, please contact the business that emailed you directly — they are responsible for their contact list and outreach. We will assist our Customers in responding to such requests.</P>

            <H2>1. Information We Collect</H2>
            <P><strong>From Customers (account holders):</strong></P>
            <UL>
              <li>Account information: name, email, username, password (stored as a salted hash, never in plain text).</li>
              <li>Billing information: handled by our payment processor; we do not store full card numbers.</li>
              <li>Connected inbox credentials: OAuth tokens or SMTP host/username/password if you connect a custom email account. All of these are encrypted at rest in our database.</li>
              <li>Campaign configuration: sequences, sending schedules, sender settings.</li>
              <li>Usage data: login activity, feature usage, IP address (for security and abuse prevention), browser/device information.</li>
            </UL>
            <P><strong>From/about Leads (your contacts):</strong></P>
            <UL>
              <li>Email address, name, and any other fields you upload (e.g., company name, website, industry) — manually entered, imported via CSV/Excel, or added through our API.</li>
              <li>Engagement data: whether an email was opened, links clicked, and reply content, used to power scheduling logic (including conditional branching) and reporting.</li>
              <li>Reply email content may be processed by an AI model (see Section 4) to help detect interest, out-of-office replies, or unsubscribe requests.</li>
            </UL>

            <H2>2. How We Use Information</H2>
            <UL>
              <li>To provide the Service: sending your emails, tracking opens/clicks, scheduling follow-ups, and (if enabled) automatically branching sequences based on recipient behavior.</li>
              <li>To detect and prevent abuse, spam, and violations of our Terms of Service.</li>
              <li>To maintain and improve deliverability tooling (SPF/DKIM/DMARC checks, inbox warm-up, bounce/complaint handling).</li>
              <li>To communicate with Customers about their account, billing, and product updates.</li>
              <li>To provide optional AI-assisted features, such as classifying replies.</li>
            </UL>
            <P>We do not sell personal data, and we do not use lead data collected through the Service to advertise to those leads ourselves.</P>

            <H2>3. Who We Share Data With</H2>
            <UL>
              <li><strong>Email providers</strong> you connect (Google, Microsoft, or your SMTP host) — to actually send your emails.</li>
              <li><strong>AI providers</strong> — if you enable AI-assisted reply classification, relevant reply text is sent to the configured third-party AI provider. You control whether this feature is enabled.</li>
              <li><strong>Infrastructure providers</strong> — our servers are hosted with Hetzner.</li>
              <li><strong>Payment processor</strong> — for billing purposes.</li>
              <li><strong>Legal requirements</strong> — if required to comply with valid legal process, or to protect our rights, users, or the public.</li>
            </UL>
            <P>We do not share Customer or lead data with third parties for their own marketing purposes.</P>

            <H2>4. Data Retention</H2>
            <UL>
              <li>Account data is retained while your account is active.</li>
              <li>Lead and campaign data is retained while you use the Service, and for a reasonable period after account closure, after which it is permanently deleted.</li>
              <li>You can request deletion of your account and associated data at any time (see Section 8).</li>
            </UL>

            <H2>5. Security</H2>
            <P>We take security seriously and have implemented:</P>
            <UL>
              <li>Encryption at rest for sensitive credentials (SMTP passwords, OAuth tokens, API keys, and other secrets).</li>
              <li>Password hashing (never stored in plain text).</li>
              <li>Per-organization data isolation, so one Customer's data is never visible to another.</li>
              <li>Rate limiting and account lockout protections on login to resist brute-force attacks.</li>
              <li>HTTPS/TLS encryption for data in transit.</li>
            </UL>
            <P>No system is 100% secure, and we cannot guarantee absolute security, but we continuously work to improve our safeguards.</P>

            <H2>6. Cookies</H2>
            <P>We use session cookies/tokens to keep you logged in and to remember basic preferences. We do not use third-party advertising trackers on the Service.</P>

            <H2>7. Your Rights</H2>
            <P>Depending on your location, you may have rights to access, correct, export, or delete your personal data, and (for EU/UK residents) rights under GDPR.</P>
            <P><strong>Customers:</strong> you can access and edit most of your data directly in the app. To request full account deletion, contact <a href="mailto:hello@devlet.tech" className="lg-link">hello@devlet.tech</a>.</P>
            <P><strong>Leads:</strong> every email sent through the Service includes an unsubscribe link and, where applicable, a "List-Unsubscribe" header — using it will stop future emails. For full data removal, contact the business that emailed you.</P>

            <H2>8. Children's Privacy</H2>
            <P>The Service is not directed at, and should not be used by, anyone under 18. We do not knowingly collect data from children.</P>

            <H2>9. International Data Transfers</H2>
            <P>Our infrastructure may process and store data in different countries than where you or your leads are located. Where required, we rely on appropriate legal safeguards for such transfers.</P>

            <H2>10. Changes to This Policy</H2>
            <P>We may update this Privacy Policy from time to time. Material changes will be communicated via email or an in-app notice before they take effect.</P>

            <H2>11. Contact Us</H2>
            <P>Questions about this policy or your data: <a href="mailto:hello@devlet.tech" className="lg-link">hello@devlet.tech</a></P>

          </div>
        </div>
      </div>
    </>
  );
}