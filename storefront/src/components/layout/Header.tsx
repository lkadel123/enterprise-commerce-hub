import * as React from "react";
import { Link } from "@tanstack/react-router";

import { MainNav } from "@/components/navigation/MainNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { AuthNav } from "@/components/auth/AuthNav";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * NASB storefront header — a refined editorial masthead.
 *
 * - Ivory background, black typography, thin border.
 * - The NASB logo anchors the brand (existing public/logo.png asset).
 * - On scroll the header height reduces slightly while staying legible.
 * - Mobile renders the hamburger sheet (MobileNav); desktop shows MainNav and
 *   the primary CTA plus authentication (AuthNav).
 */
export function Header() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm transition-[box-shadow,min-height] duration-300 supports-[backdrop-filter]:bg-background/85",
        scrolled
          ? "border-border shadow-[0_1px_0_0_var(--color-border),0_14px_34px_-24px_rgb(17_17_17_/_0.4)]"
          : "border-border/70",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-[min-height] duration-300 sm:px-6",
          scrolled ? "min-h-16" : "min-h-20",
        )}
      >
        {/* Brand mark: the existing logo asset (public/logo.png, 1254×1254,
            transparent background, black + orange wordmark). Height-driven and
            width-auto so the square asset never distorts; object-contain is a
            safety net if any future sizing changes the box ratio. */}
        <Link to="/" className="flex items-center" aria-label={`${BRAND.name} — home`}>
          <img
            src="/logo.png"
            alt={`${BRAND.name} logo`}
            width={2454}
            height={2454}
            className="h-11 w-auto object-contain sm:h-12 lg:h-14"
            loading="eager"
          />
        </Link>

        <MainNav orientation="horizontal" className="hidden xl:flex" />

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/products"
            className="inline-flex h-11 items-center justify-center rounded-[2px] bg-ink px-6 text-sm font-semibold tracking-wide text-white transition-colors duration-300 hover:bg-dark-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Explore Collection
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <AuthNav className="hidden lg:flex" />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
