import LegalLayout, { H2, P, UL } from '../components/LegalLayout';

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated={new Date().toISOString().split('T')[0]} >
      <P>These Terms of Service ("Terms") are a legal agreement between you ("Customer," "you") and Devlet Tech ("Devlet Tech," "we," "us," "our"), a company registered in the United States, governing your access to and use of InboxAir, our cold email automation platform (the "Service"), available at devlet.tech and any related subdomains.</P>
      <P>By creating an account or using the Service, you agree to these Terms. If you are using the Service on behalf of a company, you represent that you have authority to bind that company, and "you" refers to that company.</P>

      <H2>1. The Service</H2>
      <P>InboxAir lets you connect your own email accounts (Gmail, Microsoft 365, or SMTP), upload or import contact lists, build multi-step email sequences (including conditional branching), and send outbound email campaigns on your behalf. The Service includes scheduling, deliverability tools (SPF/DKIM/DMARC checking, inbox warm-up), reply tracking, and AI-assisted reply classification.</P>
      <P>We may add, change, or remove features at any time. We'll try to give reasonable notice of material changes that reduce functionality you're actively paying for.</P>

      <H2>2. Account Registration</H2>
      <UL>
        <li>You must provide accurate registration information and keep it up to date.</li>
        <li>You are responsible for all activity under your account, including actions taken by team members you invite.</li>
        <li>You must be at least 18 years old (or the age of majority in your jurisdiction) to use the Service.</li>
        <li>Keep your login credentials confidential. Notify us immediately of any unauthorized access.</li>
      </UL>

      <H2>3. Acceptable Use — Read This Carefully</H2>
      <P>InboxAir sends email on your behalf, using your own connected inboxes. <strong>You are solely responsible for the content of every email you send and for how you obtained your recipient list.</strong> By using the Service, you agree that you will NOT:</P>
      <UL>
        <li>Send unsolicited commercial email in violation of applicable law, including the U.S. CAN-SPAM Act, Canada's CASL, the EU/UK GDPR and PECR, or any equivalent law in your recipients' jurisdiction.</li>
        <li>Send to purchased, scraped, or rented email lists where you lack a lawful basis (consent or legitimate interest, as applicable) to contact the recipient.</li>
        <li>Omit a functioning unsubscribe mechanism, a valid physical mailing address, or an accurate "From" name and subject line, where required by law.</li>
        <li>Continue emailing a recipient after they unsubscribe or ask you to stop.</li>
        <li>Send content that is fraudulent, deceptive, defamatory, obscene, threatening, or that infringes someone else's intellectual property or privacy rights.</li>
        <li>Use the Service to distribute malware, conduct phishing, or impersonate another person or business.</li>
        <li>Attempt to circumvent sending limits, rate limits, or deliverability safeguards built into the Service.</li>
        <li>Resell or provide the Service to third parties without our written permission.</li>
        <li>Reverse-engineer, scrape, or attempt to extract the Service's source code or underlying models, except as permitted by open-source license terms that may apply to portions of the codebase.</li>
      </UL>
      <P><strong>Consequences of violation:</strong> We may suspend or terminate your account, with or without notice, for violations of this section — particularly high spam-complaint rates, blacklisting events, or legal complaints — since abuse by one customer can damage email deliverability for others on shared infrastructure.</P>

      <H2>4. Your Data and Content</H2>
      <UL>
        <li><strong>You own your data.</strong> Leads, campaign content, and email content you upload or send through the Service remain yours.</li>
        <li>You grant us a limited license to store, process, and transmit that data solely to provide the Service to you.</li>
        <li>You represent that you have the right to upload and process the contact data you provide, and that doing so complies with applicable data protection and anti-spam law.</li>
        <li>See our <a href="/privacy" className="text-teal-600 hover:underline">Privacy Policy</a> for details on how we handle data, including personal data of your leads.</li>
      </UL>

      <H2>5. Third-Party Services</H2>
      <P>The Service integrates with third parties you choose to connect, including Google (Gmail/Workspace), Microsoft (Office 365), your own SMTP provider, and AI providers used for optional features like reply classification. Your use of those third-party services is also governed by their own terms. We are not responsible for outages, policy changes, or account actions taken by those third parties.</P>

      <H2>6. Fees and Payment</H2>
      <UL>
        <li>The Service is offered on paid subscription plans as described at devlet.tech/pricing, currently ranging from $29–$399/month depending on tier.</li>
        <li>Fees are billed in advance on a recurring basis and are non-refundable except as required by law or as we expressly state.</li>
        <li>We may change pricing with at least 30 days' notice before it applies to your next billing cycle.</li>
        <li>Failure to pay may result in suspension or termination of your account.</li>
      </UL>

      <H2>7. Suspension and Termination</H2>
      <UL>
        <li>You may cancel your account at any time; cancellation takes effect at the end of your current billing period.</li>
        <li>We may suspend or terminate your account immediately for violation of Section 3, non-payment, fraud, or actions that put our infrastructure, deliverability, or other customers at risk.</li>
        <li>Upon termination, your right to use the Service ends. We will retain or delete your data per our Privacy Policy and applicable law.</li>
      </UL>

      <H2>8. Intellectual Property</H2>
      <P>The Service, including its software, design, and branding, is owned by Devlet Tech and its licensors. These Terms do not grant you any rights to our trademarks or brand assets beyond what's needed to use the Service normally.</P>

      <H2>9. Disclaimers</H2>
      <P>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE THAT EMAILS SENT THROUGH THE SERVICE WILL BE DELIVERED, AVOID SPAM FILTERS, OR ACHIEVE ANY PARTICULAR RESULT.</P>

      <H2>10. Limitation of Liability</H2>
      <P>TO THE MAXIMUM EXTENT PERMITTED BY LAW, DEVLET TECH WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, OR DATA, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AROSE.</P>

      <H2>11. Indemnification</H2>
      <P>You agree to indemnify and hold Devlet Tech harmless from any claims, damages, or expenses (including reasonable legal fees) arising from: (a) your violation of these Terms, (b) the content of emails you send through the Service, or (c) your violation of applicable anti-spam or data protection law.</P>

      <H2>12. Governing Law</H2>
      <P>These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Any dispute will be resolved in the state or federal courts located in Delaware, and you consent to that jurisdiction.</P>

      <H2>13. Changes to These Terms</H2>
      <P>We may update these Terms from time to time. We'll notify you of material changes before they take effect. Continued use of the Service after changes take effect constitutes acceptance.</P>

      <H2>14. Contact</H2>
      <P>Questions about these Terms: <a href="mailto:hello@devlet.tech" className="text-teal-600 hover:underline">hello@devlet.tech</a></P>
    </LegalLayout>
  );
}