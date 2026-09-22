import { Bell, LogOut, User } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { useCustomerAuth } from "@/lib/auth/CustomerAuthContext";
import { useUnreadCountQuery } from "@/features/account/account-hooks";

export interface AuthNavProps {
  className?: string;
}

/**
 * Auth-aware navigation fragment for the NASB storefront header.
 *
 * - While the session is being restored (loading), renders nothing so the
 *   header doesn't flash between guest/authenticated states.
 * - Guest: shows "Sign in" (text link) + "Create account" (outlined button).
 * - Authenticated: shows the customer's name (linked to /account) + a
 *   "Sign out" button.
 *
 * Logout is best-effort: the local auth state is always cleared, even if the
 * backend request fails. A full page navigation to `/` ensures the refreshed
 * (unauthenticated) state is clean and any open mobile sheet is closed.
 */
export function AuthNav({ className }: AuthNavProps) {
  const { customer, isAuthenticated, isLoading, logout } = useCustomerAuth();
  const unread = useUnreadCountQuery();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated && customer) {
    return (
      <nav className={className} aria-label="Account navigation">
        <div className="flex items-center gap-1">
          <Link
            to="/account/notifications"
            aria-label={
              unread.data && unread.data > 0
                ? `Notifications (${unread.data} unread)`
                : "Notifications"
            }
            className="relative flex h-11 w-11 items-center justify-center rounded-sm text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="h-5 w-5" />
            {unread.data !== undefined && unread.data > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-dark-gold px-1 text-[10px] font-semibold text-white"
              >
                {unread.data > 99 ? "99+" : unread.data}
              </span>
            ) : null}
          </Link>
          <Link
            to="/account"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold text-ink hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <User className="h-4 w-4" />
            <span>{customer.name}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => {
                window.location.href = "/";
              });
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-sm px-3 py-2 text-sm font-semibold text-muted-text hover:bg-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden 2xl:inline">Sign out</span>
            <span className="sr-only 2xl:hidden">Sign out</span>
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className={className} aria-label="Authentication">
      <div className="flex items-center gap-1">
        <Link
          to="/login"
          className="inline-flex min-h-[44px] items-center rounded-sm px-3 py-2 text-sm font-semibold text-ink hover:text-dark-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="inline-flex h-11 items-center justify-center rounded-[2px] border border-ink bg-transparent px-4 text-sm font-semibold text-ink transition-colors duration-300 hover:bg-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Create account
        </Link>
      </div>
    </nav>
  );
}
