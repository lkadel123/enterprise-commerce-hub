import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";

import { PageLoader } from "@/components/loading/PageLoader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { pageHead } from "@/lib/seo";
import { useCustomerAuth, isSafeRedirect } from "@/lib/auth/CustomerAuthContext";

/**
 * Social sign-in callback page.
 *
 * The backend (`/api/v1/auth/customer/{google|facebook}/callback`) verifies the
 * OAuth round trip server-side. For EXISTING customers it establishes the
 * normal httpOnly refresh session (same mechanism as password login) and
 * redirects the browser here:
 *
 *   /auth/callback?redirect=%2Fcheckout        (success)
 *   /auth/callback?error=<code>&redirect=...   (failure)
 *
 * For a NEW social customer the backend creates NO account yet. Instead it
 * sets a signed, single-use, HttpOnly consent continuation and redirects here:
 *
 *   /auth/callback?terms=1&redirect=%2Fcheckout  (Terms consent required)
 *
 * This page then shows the Terms & Conditions consent step. Only after the
 * user explicitly checks the box and confirms does the frontend POST to
 * `/auth/customer/social/accept-terms`, where the backend re-validates the
 * signed continuation and creates the CUSTOMER account.
 *
 * On success the page simply waits for the auth context to finish the standard
 * boot-time session restore and then navigates to the safe `redirect` target.
 * On failure it shows a coarse, user-friendly message — the backend never sends
 * error details, secrets, or stack traces.
 */

/** Coarse error codes produced by the backend social controllers. */
export const SOCIAL_AUTH_ERRORS = [
  "provider_not_configured",
  "invalid_state",
  "oauth_cancelled",
  "oauth_failed",
  "email_unavailable",
  "email_unverified",
  "account_suspended",
  "account_conflict",
  "provider_unavailable",
] as const;

export type SocialAuthErrorCode = (typeof SOCIAL_AUTH_ERRORS)[number];

const SOCIAL_AUTH_ERROR_MESSAGE: Record<SocialAuthErrorCode, string> = {
  provider_not_configured:
    "Sign-in with this provider isn't available right now. Please try again later.",
  invalid_state: "This sign-in link was invalid or expired. Please try signing in again.",
  oauth_cancelled: "Sign-in was cancelled. No changes were made to your account.",
  oauth_failed: "We couldn't sign you in with that provider. Please try again.",
  email_unavailable:
    "This provider did not share an email address for your account. Use your email and password instead.",
  email_unverified:
    "The provider did not verify your email address. Sign in with your email and password instead.",
  account_suspended: "This account is not active. Contact support for help.",
  account_conflict:
    "This social account is already linked to another customer. Sign in with your email and password.",
  provider_unavailable:
    "The sign-in provider is temporarily unavailable. Please try again later.",
};

function isSocialAuthError(value: unknown): value is SocialAuthErrorCode {
  return typeof value === "string" && (SOCIAL_AUTH_ERRORS as readonly string[]).includes(value);
}

interface AuthCallbackSearch {
  error?: SocialAuthErrorCode | undefined;
  redirect?: string | undefined;
  /** Present (`terms=1`) when a NEW social customer must accept the Terms first. */
  terms?: boolean | undefined;
}

function validateSearch(search: Record<string, unknown>): AuthCallbackSearch {
  const error = search["error"];
  const redirect = search["redirect"];
  const terms = search["terms"];
  return {
    // Only known codes are surfaced; anything else is treated as a generic error.
    error: isSocialAuthError(error) ? error : undefined,
    redirect: typeof redirect === "string" && isSafeRedirect(redirect) ? redirect : undefined,
    // TanStack Router parses `?terms=1` as the number 1 — accept both forms.
    terms: terms === "1" || terms === 1 || terms === true ? true : undefined,
  };
}

export const Route = createFileRoute("/auth/callback")({
  validateSearch,
  head: () => {
    const base = pageHead({
      title: "Signing you in — NASB",
      description: "Completing your social sign-in.",
      path: "/auth/callback",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { error, redirect, terms } = useSearch({ from: Route.id });
  const { status, isAuthenticated, acceptSocialTerms } = useCustomerAuth();
  const navigate = useNavigate();
  const navigated = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const target = redirect ?? "/account";
  // A backend error code always wins over the consent step — the consent
  // continuation exists only on a clean `?terms=1` redirect.
  const needsConsent = terms === true && !error;

  useEffect(() => {
    // Only navigate once, after the session restore actually completed.
    if (isAuthenticated && !navigated.current) {
      navigated.current = true;
      navigate({ to: target, replace: true });
    }
  }, [isAuthenticated, navigate, target]);

  useEffect(() => {
    // A signed-in customer never needs the consent step (e.g. stale tab).
    if (needsConsent && isAuthenticated && !navigated.current) {
      navigated.current = true;
      navigate({ to: target, replace: true });
    }
  }, [needsConsent, isAuthenticated, navigate, target]);

  async function handleConsentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setConsentError(null);
    if (!accepted || submitting) return;
    setSubmitting(true);
    try {
      await acceptSocialTerms();
      // The context applied the new session; the effect above navigates to the
      // safe target.
    } catch {
      // The consent continuation may have expired (short-lived, single-use) —
      // the user must restart the provider round trip. No internals are shown.
      setConsentError(
        "Your sign-in session expired. Please go back and sign in with the provider again.",
      );
      setSubmitting(false);
    }
  }

  if (needsConsent) {
    const showValidation = touched && !accepted;
    return (
      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-20 sm:py-28 sm:px-6">
        <div className="w-full max-w-md">
          <h1 className="text-center text-display">Almost done — one more step</h1>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            To finish creating your account, please review and accept our Terms &amp;
            Conditions and Privacy Policy.
          </p>
          <form onSubmit={handleConsentSubmit} noValidate className="mt-6">
            <div className="flex items-start gap-3 rounded-md border border-border bg-card px-4 py-3">
              <Checkbox
                id="social-terms-accept"
                checked={accepted}
                onCheckedChange={(checked) => {
                  setAccepted(checked === true);
                  setTouched(true);
                }}
                aria-invalid={showValidation}
                aria-describedby={showValidation ? "social-terms-error" : undefined}
                aria-labelledby="social-terms-label"
                className="mt-0.5"
              />
              {/* The Radix checkbox renders as a button (not a labelable form
                  element), so the text names it via aria-labelledby. Clicks on
                  the text toggle the checkbox; clicks on the legal links
                  navigate normally. */}
              <span
                id="social-terms-label"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("a")) return;
                  setAccepted((previous) => !previous);
                  setTouched(true);
                }}
                className="cursor-pointer text-sm leading-relaxed"
              >
                I agree to the{" "}
                <Link to="/terms" className="font-medium text-primary underline underline-offset-2">
                  Terms &amp; Conditions
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </div>
            {showValidation ? (
              <p id="social-terms-error" role="alert" className="mt-2 text-sm text-destructive">
                Please agree to the Terms &amp; Conditions and Privacy Policy to create your
                account.
              </p>
            ) : null}
            {consentError ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {consentError}
              </p>
            ) : null}
            <Button type="submit" disabled={submitting} className="mt-4 w-full min-h-[44px]">
              {submitting ? "Creating your account…" : "Create my account"}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              No account has been created yet — nothing is stored until you accept.
            </p>
          </form>
        </div>
      </section>
    );
  }

  if (!error && status === "loading") {
    return <PageLoader label="Completing sign-in…" />;
  }

  const failureMessage = error ? SOCIAL_AUTH_ERROR_MESSAGE[error] : null;

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-4 py-20 sm:py-28 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="text-center text-display">Sign-in unsuccessful</h1>
        <p
          role={failureMessage ? "status" : "alert"}
          aria-live="polite"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
        >
          {failureMessage ?? "We couldn't complete your sign-in. Please try again."}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <Link
            to="/login"
            search={{ redirect: target }}
            className="inline-flex min-h-[44px] items-center rounded-sm px-3 py-2 text-sm font-semibold text-primary underline underline-offset-2"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
