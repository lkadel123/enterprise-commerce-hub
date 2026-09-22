import { Link, Outlet, useLocation, createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Ticket,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Star,
  Package,
  UserRound,
} from "lucide-react";

import { AuthGuard } from "@/components/auth/AuthGuard";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";
import { useCustomerAuth } from "@/lib/auth/CustomerAuthContext";
import { useUnreadCountQuery } from "@/features/account/account-hooks";

/**
 * Protected account shell (`/account/*`).
 *
 * `account.tsx` acts as the TanStack Router parent layout for every
 * `account.*.tsx` child route: it enforces authentication via `AuthGuard`,
 * renders the responsive section navigation (vertical sidebar on desktop,
 * horizontal scroll strip on mobile) and an `<Outlet />` for the active
 * section. Private data is only fetched by child routes once auth has
 * resolved — nothing private ever renders into unauthenticated SSR HTML.
 */

const SECTIONS = [
  { label: "Dashboard", to: "/account", icon: LayoutDashboard, exact: true },
  { label: "Profile", to: "/account/profile", icon: UserRound, exact: false },
  { label: "Addresses", to: "/account/addresses", icon: MapPin, exact: false },
  { label: "Orders", to: "/account/orders", icon: Package, exact: false },
  { label: "Notifications", to: "/account/notifications", icon: Bell, exact: false },
  { label: "Coupons", to: "/account/coupons", icon: Ticket, exact: false },
  { label: "Reviews", to: "/account/reviews", icon: Star, exact: false },
  { label: "Support", to: "/account/support", icon: LifeBuoy, exact: false },
] as const;

function AccountNavLinks({
  orientation,
  onNavigate,
}: {
  orientation: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const { data: unreadCount } = useUnreadCountQuery();

  return (
    <nav
      aria-label="Account sections"
      className={
        orientation === "desktop"
          ? "flex flex-col gap-1"
          : "-mx-4 flex gap-1 overflow-x-auto px-4 pb-1"
      }
    >
      {SECTIONS.map((section) => {
        const active = section.exact
          ? location.pathname === "/account"
          : location.pathname.startsWith(section.to);
        const Icon = section.icon;
        return (
          <Link
            key={section.to}
            to={section.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={
              orientation === "desktop"
                ? "flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" +
                  (active
                    ? " bg-accent text-accent-foreground"
                    : " text-muted-foreground hover:bg-accent/60 hover:text-foreground")
                : "flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" +
                  (active ? " border-primary text-primary" : " text-muted-foreground")
            }
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {section.label}
            {section.to === "/account/notifications" && unreadCount && unreadCount > 0 ? (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export const Route = createFileRoute("/account")({
  head: () => {
    const base = pageHead({
      title: "My Account — NASB",
      description: "Manage your profile, orders, addresses and support.",
      path: "/account",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: AccountLayout,
});

function AccountLayout() {
  const { customer, logout } = useCustomerAuth();

  return (
    <AuthGuard>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-display">My Account</h1>
            {customer ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                Signed in as {customer.name} ({customer.email})
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => {
              void logout().then(() => {
                window.location.href = "/";
              });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>

        {/* Mobile: horizontally scrollable section strip */}
        <div className="mt-6 md:hidden">
          <AccountNavLinks orientation="mobile" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 md:mt-8 md:grid-cols-[220px_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden md:block" aria-label="Account sections">
            <AccountNavLinks orientation="desktop" />
          </aside>

          <main className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
