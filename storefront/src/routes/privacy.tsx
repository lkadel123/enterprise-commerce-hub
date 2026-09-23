import { createFileRoute, Link } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";

/**
 * Privacy Policy — placeholder legal-information page.
 *
 * NOTE FOR BUSINESS/LEGAL REVIEW: the sections below are structured
 * placeholders, not legal advice. Every section must be reviewed and replaced
 * with company-specific, legally-reviewed content before production launch.
 * No regulatory or compliance claims are made here on the company's behalf.
 */
export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead({
      title: "Privacy Policy — NASB",
      description: "How NASB collects, uses, and protects your information.",
      path: "/privacy",
    }),
  component: PrivacyPage,
});

interface PrivacySection {
  heading: string;
  /** Each entry is a paragraph; keep content plain and reviewable. */
  paragraphs: string[];
}

const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    heading: "Information Collected",
    paragraphs: [
      "We collect the information needed to operate the storefront: account details you provide, order and checkout information, and basic technical data such as session cookies.",
      "[Placeholder — business review required: analytics, marketing communications, and any additional data collection.]",
    ],
  },
  {
    heading: "Account Information",
    paragraphs: [
      "When you register a customer account we store your name and email address, and a securely hashed password (we never store your password in readable form).",
    ],
  },
  {
    heading: "Order & Payment Information",
    paragraphs: [
      "Orders are stored so we can fulfil and support them. Payments are processed by our payment service provider; we do not store your full payment card details on our servers.",
      "[Placeholder — business review required: payment-processor data-sharing description.]",
    ],
  },
  {
    heading: "Authentication / Social Sign-In Information",
    paragraphs: [
      "If you sign in with a supported social provider (currently Google or Facebook), we store the provider name, your provider account ID, and the name, email, and profile image the provider shares with us after you approve access. Provider passwords are never shared with us, and provider access tokens are never stored.",
      "You can unlink a social provider or sign in with your email and password instead.",
    ],
  },
  {
    heading: "Cookies & Session Information",
    paragraphs: [
      "We use strictly necessary cookies to keep you signed in: an httpOnly session cookie (not readable by scripts) and a small session-presence hint. We do not use these cookies for advertising.",
      "[Placeholder — business review required: consent preferences, analytics cookies.]",
    ],
  },
  {
    heading: "How Information Is Used",
    paragraphs: [
      "Your information is used to provide the service: operating your account, processing orders and payments, providing support, and maintaining security. We do not sell your personal information.",
    ],
  },
  {
    heading: "Data Sharing",
    paragraphs: [
      "We share data only with the service providers required to run the store (e.g. payment processing) and where required by law. Each provider receives only what is necessary.",
    ],
  },
  {
    heading: "Data Security",
    paragraphs: [
      "Passwords are stored as salted hashes, sessions use signed httpOnly cookies, and all traffic should run over HTTPS. Access to personal data is limited to what is needed to operate the service.",
    ],
  },
  {
    heading: "Data Retention",
    paragraphs: [
      "Account and order data are kept while your account is active and as needed for legal and operational purposes. You can request deletion of your account and personal data by contacting support.",
      "[Placeholder — business review required: specific retention periods.]",
    ],
  },
  {
    heading: "Your Rights",
    paragraphs: [
      "You can view and update your account details, sign out, and request access to or deletion of your personal data. Contact support to exercise these rights.",
      "[Placeholder — legal review required: statutory rights wording applicable to your market.]",
    ],
  },
  {
    heading: "Policy Changes",
    paragraphs: [
      "We may update this policy from time to time. Changes will be published on this page with an updated version reference.",
    ],
  },
  {
    heading: "Contact Information",
    paragraphs: [
      "[Placeholder — business review required: support contact email/address.] Questions about this policy can be raised through our support channels.",
    ],
  },
];

function PrivacyPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-display">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Version 1.0 — placeholder content pending business/legal review.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        {PRIVACY_SECTIONS.map((section) => (
          <section key={section.heading} aria-labelledby={`privacy-${section.heading}`}>
            <h2 id={`privacy-${section.heading}`} className="text-lg font-semibold">
              {section.heading}
            </h2>
            <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        See also our{" "}
        <Link to="/terms" className="font-medium text-primary underline underline-offset-2">
          Terms &amp; Conditions
        </Link>
        .
      </p>
    </section>
  );
}
