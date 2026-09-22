import { Link } from "@tanstack/react-router";
import { Phone } from "lucide-react";

import { BRAND, SOCIAL_LINKS } from "@/lib/brand";

/**
 * NASB footer — the closing brand statement.
 *
 * A strong black surface that mirrors the heritage identity: the NASB wordmark
 * in ivory, the tagline, and the registered company details. This is a brand
 * moment, not merely a collection of links.
 */
export function Footer() {
  return (
    <footer className="border-t border-charcoal bg-ink text-ivory">
      {/* Brand statement band */}
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Statement */}
          <div className="max-w-md lg:flex-1">
            {/* Footer brand mark — same /logo.png asset as the header. The logo
                is a dark (black + orange) mark on transparency, so it sits on an
                ivory tile for legibility on the dark ink surface. The tile keeps
                the square asset from distorting; object-contain prevents any crop. */}
            <Link to="/" className="inline-flex w-fit" aria-label={`${BRAND.name} — home`}>
              <span className="flex h-16 w-20 items-center justify-center rounded-[2px] bg-ivory p-2 sm:h-[4.25rem] sm:w-[4.25rem]">
                <img
                  src="/logo.png"
                  alt={`${BRAND.name} logo`}
                  width={2454}
                  height={2454}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </span>
            </Link>
            <p className="mt-5 font-serif text-4xl font-bold leading-[1.05] text-ivory sm:text-5xl">
              {BRAND.tagline}
            </p>
            <p className="mt-6 text-sm uppercase tracking-[0.25em] text-ivory/70">
              {BRAND.statement} · {BRAND.year}
            </p>
            <div className="mt-8 h-px w-24 bg-gold" aria-hidden="true" />
          </div>

          {/* Company */}
          <div className="lg:flex-1">
            <h2 className="text-label text-ivory/50">Company</h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ivory/85">{BRAND.company}</p>
            <address className="mt-4 max-w-xs text-sm not-italic leading-relaxed text-ivory/70">
              {BRAND.addressLines[0]}
              <br />
              {BRAND.addressLines[1]}
            </address>
          </div>

          {/* Registrations */}
          <div className="lg:flex-1">
            <h2 className="text-label text-ivory/50">Registrations</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-ivory/50">OCR Registration No.</dt>
                <dd className="mt-0.5 text-ivory/90">{BRAND.ocrRegistration}</dd>
              </div>
              <div>
                <dt className="text-ivory/50">DOC Registration No.</dt>
                <dd className="mt-0.5 text-ivory/90">{BRAND.docRegistration}</dd>
              </div>
              <div>
                <dt className="text-ivory/50">IRD PAN</dt>
                <dd className="mt-0.5 text-ivory/90">{BRAND.irdPan}</dd>
              </div>
            </dl>
          </div>

          {/* Complaints / contact */}
          <div className="lg:flex-1">
            <h2 className="text-label text-ivory/50">Complaints</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-ivory/50">Complaints Officer</dt>
                <dd className="mt-0.5 text-ivory/90">{BRAND.complaintsOfficer}</dd>
              </div>
              <div>
                <dt className="sr-only">Phone</dt>
                <dd className="mt-0.5">
                  <a
                    href={`tel:+977${BRAND.phone}`}
                    className="inline-flex items-center gap-2 text-ivory/90 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    +977 {BRAND.phone}
                  </a>
                </dd>
              </div>
            </dl>
            <nav aria-label="Footer" className="mt-8 flex items-center gap-6">
              <Link
                to="/products"
                className="text-sm text-ivory/60 transition-colors hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                Shop
              </Link>
              <a
                href="/api/v1/public/robots.txt"
                className="text-sm text-ivory/60 transition-colors hover:text-ivory"
              >
                Robots
              </a>
              <a
                href="/api/v1/public/sitemap.xml"
                className="text-sm text-ivory/60 transition-colors hover:text-ivory"
              >
                Sitemap
              </a>
            </nav>

            {/* Social media — config-driven via SOCIAL_LINKS (brand.ts). Every
                entry opens the official platform page in a new tab. URLs are
                placeholders until the company's official profiles are supplied;
                see src/lib/brand.ts. Icons keep an 11×11 (44px) touch target,
                an accessible name, and a visible gold focus ring. Until a URL is
                configured each icon renders as a pending, aria-disabled item
                (href omitted — no fabricated links are ever emitted). */}
            <div className="mt-8">
              <h2 className="text-label text-ivory/50">Social</h2>
              <ul className="mt-4 flex flex-wrap items-center gap-1">
                {SOCIAL_LINKS.map(({ platform, url, icon: Icon }) => (
                  <li key={platform}>
                    <a
                      href={url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${BRAND.name} on ${platform}`}
                      aria-disabled={url ? undefined : true}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-[2px] text-ivory/70 transition-colors hover:bg-ivory/10 hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-ivory/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-ivory/50 sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} {BRAND.company}
          </p>
          <p className="uppercase tracking-[0.22em]">{BRAND.statement}</p>
        </div>
      </div>
    </footer>
  );
}
