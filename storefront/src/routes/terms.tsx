import { createFileRoute, Link } from "@tanstack/react-router";

import { pageHead } from "@/lib/seo";

/**
 * Terms & Conditions — placeholder legal-information page.
 *
 * NOTE FOR BUSINESS/LEGAL REVIEW: the sections below are structured
 * placeholders, not legal advice. Every section must be reviewed and replaced
 * with company-specific, legally-reviewed content before production launch.
 * No regulatory or compliance claims are made here on the company's behalf.
 */
export const Route = createFileRoute("/terms")({
  head: () =>
    pageHead({
      title: "Terms & Conditions — NASB",
      description: "The terms and conditions governing your use of NASB.",
      path: "/terms",
    }),
  component: TermsPage,
});

interface TermsSection {
  heading: string;
  /** Each entry is a paragraph; keep content plain and reviewable. */
  paragraphs: string[];
}

const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: "Introduction",
    paragraphs: [
      "These Terms & Conditions govern your access to and use of this storefront and any related services. By creating an account or using the site, you agree to these terms.",
      "[Placeholder — business review required: legal entity name, jurisdiction, and effective date.]",
    ],
  },
  {
    heading: "Account Registration",
    paragraphs: [
      "You may register a customer account with an email address and password, or by signing in through a supported social sign-in provider (currently Google or Facebook). You must provide accurate information and keep your credentials secure.",
      "You are responsible for all activity that occurs under your account. Notify us promptly if you believe unauthorized access has occurred.",
      "By creating an account you confirm that you accept these Terms & Conditions and our Privacy Policy. Your acceptance is recorded with a timestamp and version so we can identify which terms you agreed to.",
    ],
  },
  {
    heading: "User Responsibilities",
    paragraphs: [
      "You agree to use the site lawfully and not to interfere with its operation, other customers, or our systems. Accounts may be suspended for misuse, fraud, or violation of these terms.",
    ],
  },
  {
    heading: "Orders and Purchases",
    paragraphs: [
      "Placing an order constitutes an offer to purchase. We may confirm, decline, or cancel orders — for example when an item is out of stock or pricing information is incorrect.",
      "[Placeholder — business review required: order confirmation, acceptance, and cancellation process.]",
    ],
  },
  {
    heading: "Payments",
    paragraphs: [
      "Payments are processed by our payment service provider. We do not store your full payment card details on our servers.",
      "[Placeholder — business review required: accepted payment methods, currency, and payment-processor terms reference.]",
    ],
  },
  {
    heading: "Product / Service Information",
    paragraphs: [
      "Product descriptions, images, and prices are provided in good faith but may contain inaccuracies. We reserve the right to correct them and to update product information at any time.",
    ],
  },
  {
    heading: "Returns & Cancellations",
    paragraphs: [
      "[Placeholder — business review required: return window, eligibility, refund method, cancellation rights, and any statutory rights wording applicable to your market.]",
    ],
  },
  {
    heading: "Intellectual Property",
    paragraphs: [
      "The site, its content, branding, and software are protected by intellectual-property rights. You may not reproduce or exploit them without permission.",
    ],
  },
  {
    heading: "Account Suspension / Termination",
    paragraphs: [
      "We may suspend or terminate an account, with or without notice, for breach of these terms, suspected fraud, or unlawful activity. You may close your account at any time by contacting us.",
    ],
  },
  {
    heading: "Limitation of Liability",
    paragraphs: [
      "[Placeholder — legal review required: liability limitations and exclusions must be drafted for your specific jurisdiction. Nothing here should be construed as disclaiming statutory rights.]",
    ],
  },
  {
    heading: "Changes to Terms",
    paragraphs: [
      "We may update these terms from time to time. Material changes will be communicated through the site. Continued use of your account after changes take effect constitutes acceptance of the updated terms.",
    ],
  },
  {
    heading: "Contact Information",
    paragraphs: [
      "[Placeholder — business review required: support contact email/address.] Questions about these terms can be raised through our support channels.",
    ],
  },
];

function TermsPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-display">Terms &amp; Conditions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Version 1.0 — placeholder content pending business/legal review.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        {TERMS_SECTIONS.map((section) => (
          <section key={section.heading} aria-labelledby={`terms-${section.heading}`}>
            <h2 id={`terms-${section.heading}`} className="text-lg font-semibold">
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
        See also our <Link to="/privacy" className="font-medium text-primary underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </section>
  );
}
