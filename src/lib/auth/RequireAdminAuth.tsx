import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useAdminAuth } from "@/lib/auth/AdminAuthContext";

/**
 * Route guard for protected admin pages.
 *
 * Renders the wrapped (protected) content only while a real backend session is
 * held. While the session is still restoring, a lightweight boot screen is
 * shown so the shell never flashes for an unauthenticated visitor. Once the
 * session is definitively absent/invalid, the guard navigates to /login
 * (exactly once per transition — the login page lives outside the guard, so
 * no redirect loop can occur).
 *
 * The backend remains the security authority: this guard only shapes the UI.
 * Every admin API call is independently authenticated + RBAC-checked, and a
 * mid-session 401 is cleared by the client transport (`onUnauthenticated`),
 * which drives `status` back to "unauthenticated" and re-triggers this guard.
 */
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();
  const navigate = useNavigate();
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated" && !redirected) {
      setRedirected(true);
      void navigate({ to: "/login", replace: true });
    }
  }, [status, redirected, navigate]);

  if (status === "authenticated") {
    return <>{children}</>;
  }

  // restoring, or unauthenticated-but-not-yet-redirected: show a neutral boot
  // screen instead of protected UI.
  return (
    <div className="grid min-h-screen place-items-center bg-background" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        Checking session…
      </div>
    </div>
  );
}

/** Convenience: predicate for a single-use 403 permission-denied state. */
export function PermissionDenied({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-2xl font-semibold tracking-tight">Access denied</p>
      <p className="text-sm text-muted-foreground">
        Your role does not include permission to {feature}. Contact an administrator
        if you believe this is a mistake.
      </p>
    </div>
  );
}

/** Hook that returns true once auth has settled (restore finished). */
export function useAdminAuthReady(): boolean {
  const { status } = useAdminAuth();
  return status !== "restoring";
}

/** Callback-friendly unauth check for event handlers. */
export function useEnsureAdminAuth(): () => boolean {
  const { status } = useAdminAuth();
  return useCallback(() => status === "authenticated", [status]);
}
