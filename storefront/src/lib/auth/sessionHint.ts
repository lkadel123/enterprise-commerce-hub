/**
 * JS-readable session-presence hint.
 *
 * The customer refresh token lives in an HttpOnly cookie, so the storefront
 * cannot inspect it. The backend therefore sets a non-sensitive companion
 * cookie (`customer_session_hint=1`, NOT a token) whenever a refresh session
 * exists and clears it on logout. The storefront reads this hint to decide
 * whether the boot-time session restoration needs to call
 * `POST /auth/customer/refresh`:
 *
 * - No hint  → guest: skip the refresh call entirely (no request, therefore
 *   no 401 network log and no guest "error" noise in the console).
 * - Hint set → a refresh session may exist: attempt refresh. A 401 here is
 *   the expected "expired/invalid session" signal — treated as guest mode,
 *   never as an application error, and the stale hint is cleared.
 *
 * A stale/forged hint can at worst cause one extra 401 refresh call; it can
 * never grant access because the endpoint validates the real HttpOnly token.
 */

export const CUSTOMER_SESSION_HINT_COOKIE = "customer_session_hint";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null; // SSR — no cookies on the server
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    const value = match?.[1];
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

/** Whether the backend reports that a customer refresh session may exist. */
export function hasCustomerSessionHint(): boolean {
  return readCookie(CUSTOMER_SESSION_HINT_COOKIE) === "1";
}

/** Remove a stale hint cookie locally (e.g. after a failed refresh). */
export function clearCustomerSessionHint(): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${CUSTOMER_SESSION_HINT_COOKIE}=; Max-Age=0; path=/`;
  } catch {
    // Storage may be unavailable — nothing to clean up then.
  }
}

/** Test helper: simulate the backend having set (or cleared) the hint cookie. */
export function setCustomerSessionHintCookie(present: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = present
    ? `${CUSTOMER_SESSION_HINT_COOKIE}=1; path=/`
    : `${CUSTOMER_SESSION_HINT_COOKIE}=; Max-Age=0; path=/`;
}
