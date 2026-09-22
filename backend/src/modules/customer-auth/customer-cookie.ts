import type { CookieOptions } from "express";
import { env } from "../../config/env.js";

/** Customer refresh-token cookie, distinct from the admin refresh cookie. */
export const CUSTOMER_REFRESH_COOKIE_NAME = env.CUSTOMER_COOKIE_NAME;
export const CUSTOMER_REFRESH_COOKIE_PATH = "/api/v1/auth/customer";

/**
 * JS-readable session-presence hint cookie.
 *
 * This is NOT a token and carries no secret — it is the literal value "1" and
 * only mirrors the *existence* of the httpOnly refresh cookie. Because the
 * refresh cookie is httpOnly, the storefront cannot know whether a guest has
 * a session without calling the refresh endpoint (which 401s for guests and
 * logs a browser network error). The hint lets the storefront skip that call
 * for guests entirely.
 *
 * Security: the refresh endpoint still validates the real httpOnly token.
 * A missing/stale/forged hint can at worst cause one harmless extra refresh
 * call that returns 401 → guest mode. It can never grant access.
 *
 * Note: `path: "/"` and the sameSite/domain policy mirror the refresh cookie
 * so the storefront JS (which may run on a sibling origin/port of the same
 * site) can read it via `document.cookie`.
 */
export const CUSTOMER_SESSION_HINT_COOKIE_NAME = "customer_session_hint";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REMEMBER_DAYS = 30;

export function customerRefreshTtlDays(remember: boolean): number {
  return remember ? REMEMBER_DAYS : env.CUSTOMER_REFRESH_TOKEN_TTL_DAYS;
}

export function customerRefreshCookieOptions(remember: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: CUSTOMER_REFRESH_COOKIE_PATH,
    maxAge: customerRefreshTtlDays(remember) * MS_PER_DAY,
  };
}

export function clearCustomerRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: CUSTOMER_REFRESH_COOKIE_PATH,
    maxAge: 0,
  };
}

export function customerSessionHintCookieOptions(remember: boolean): CookieOptions {
  return {
    // Deliberately NOT httpOnly — the storefront must read it to skip the
    // boot refresh call for guests. It holds no token (see above).
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: customerRefreshTtlDays(remember) * MS_PER_DAY,
  };
}

export function clearCustomerSessionHintCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: "/",
    maxAge: 0,
  };
}

/**
 * OAuth CSRF-state cookie (social sign-in).
 *
 * Holds a signed, short-lived state token. It is deliberately SameSite=Lax in
 * ALL environments: the provider's redirect back to the callback is a top-level
 * cross-site GET navigation, which "strict" cookies would not survive. The
 * token itself is server-signed and single-use — a stolen cookie value without
 * the corresponding signed state (or vice versa) is rejected by the callback.
 */
export const CUSTOMER_OAUTH_STATE_COOKIE_NAME = "customer_oauth_state";

const OAUTH_STATE_PATH = "/api/v1/auth/customer";

export function customerOAuthStateCookieOptions(maxAgeMinutes: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Lax (not strict) — see above; the provider redirect is cross-site top-level GET.
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: OAUTH_STATE_PATH,
    maxAge: maxAgeMinutes * 60 * 1000,
  };
}

export function clearCustomerOAuthStateCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: OAUTH_STATE_PATH,
    maxAge: 0,
  };
}

/**
 * Social Terms & Conditions consent continuation cookie.
 *
 * After provider verification, a NEW customer must explicitly accept the
 * Terms & Conditions before their account is created. This cookie carries a
 * short-lived, server-signed, single-use continuation token holding ONLY the
 * provider-verified identity needed to finish registration — it is HttpOnly
 * (never readable by frontend JS), sameSite=Lax (it must survive the redirect
 * chain), and scoped to the customer-auth path. Provider access tokens and
 * secrets are NEVER stored here, and no identity data ever appears in URLs.
 */
export const CUSTOMER_OAUTH_CONSENT_COOKIE_NAME = "customer_oauth_consent";

export function customerOAuthConsentCookieOptions(maxAgeMinutes: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Lax — the consent step is reached via the provider's redirect chain.
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: OAUTH_STATE_PATH,
    maxAge: maxAgeMinutes * 60 * 1000,
  };
}

export function clearCustomerOAuthConsentCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    domain: env.COOKIE_DOMAIN || undefined,
    path: OAUTH_STATE_PATH,
    maxAge: 0,
  };
}
