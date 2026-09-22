import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useCustomerAuth } from "@/lib/auth/CustomerAuthContext";
import { PageLoader } from "@/components/loading/PageLoader";
import { isSafeRedirect } from "@/lib/auth/CustomerAuthContext";

/**
 * Guards protected storefront content.
 *
 * - While authentication is loading (session restoration in progress), renders a
 *   page loader so the user doesn't see a flash of protected content.
 * - If unauthenticated, redirects to `/login?redirect=<encoded-path>`.
 *
 * The redirect target is sanitized via `isSafeRedirect` to prevent open-redirect
 * attacks. Only same-origin, relative paths are allowed.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectTo = isSafeRedirect(location.pathname) ? location.pathname : "/";
      void navigate({
        to: "/login",
        search: { redirect: redirectTo },
      });
    }
  }, [isLoading, isAuthenticated, navigate, location.pathname]);

  if (isLoading) {
    return <PageLoader label="Restoring session…" />;
  }

  if (!isAuthenticated) {
    return <PageLoader label="Redirecting to sign in…" />;
  }

  return <>{children}</>;
}
