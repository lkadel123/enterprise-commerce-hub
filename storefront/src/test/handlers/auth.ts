/**
 * Auth handlers mirroring the real backend customer-auth routes mounted at
 * `/api/v1/auth/customer/*` (`backend/src/modules/customer-auth`).
 *
 * Behaviour is driven by the mutable `authState` so individual tests can
 * simulate valid sessions, expired refresh cookies and invalid credentials.
 */
import { http, HttpResponse } from "msw";

import { API_BASE_URL } from "@/config/env";
import { setCustomerSessionHintCookie } from "@/lib/auth/sessionHint";
import { CUSTOMER_PROFILE, fail, ok } from "../fixtures/catalog";

interface AuthState {
  /** Credentials accepted by the login/register handlers. */
  email: string;
  password: string;
  /** Whether the refresh cookie is treated as valid. */
  refreshValid: boolean;
}

export const authState: AuthState = {
  email: "amelia@test.com",
  password: "Testpass123!",
  refreshValid: false,
};

export function resetAuthState(): void {
  authState.email = "amelia@test.com";
  authState.password = "Testpass123!";
  authState.refreshValid = false;
  // Simulate the browser holding the backend's session-hint cookie so the
  // boot-time session restoration attempts refresh (mirroring a browser that
  // was previously signed in). Tests that need a true guest browser clear it
  // via setCustomerSessionHintCookie(false) before rendering.
  setCustomerSessionHintCookie(true);
}

function session() {
  return { customer: CUSTOMER_PROFILE, accessToken: "test-access-token", remember: true };
}

const p = `${API_BASE_URL}/auth/customer`;

export const authHandlers = [
  http.post(`${p}/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email !== authState.email || body.password !== authState.password) {
      return HttpResponse.json(fail("INVALID_CREDENTIALS", "Invalid email or password."), {
        status: 401,
      });
    }
    return HttpResponse.json(ok(session()));
  }),

  http.post(`${p}/register`, async ({ request }) => {
    const body = (await request.json()) as { acceptedTerms?: unknown };
    // Mirror the backend literal-true enforcement: no acceptance, no account.
    if (body.acceptedTerms !== true) {
      return HttpResponse.json(
        fail("VALIDATION_ERROR", "You must accept the Terms & Conditions and Privacy Policy."),
        { status: 422 },
      );
    }
    return HttpResponse.json(ok(session()));
  }),

  http.post(`${p}/social/accept-terms`, async ({ request }) => {
    const body = (await request.json()) as { acceptedTerms?: unknown };
    if (body.acceptedTerms !== true) {
      return HttpResponse.json(
        fail("VALIDATION_ERROR", "You must accept the Terms & Conditions and Privacy Policy."),
        { status: 422 },
      );
    }
    return HttpResponse.json(ok(session()));
  }),

  http.post(`${p}/refresh`, () => {
    if (!authState.refreshValid) {
      return HttpResponse.json(fail("UNAUTHENTICATED", "No valid session."), { status: 401 });
    }
    return HttpResponse.json(ok(session()));
  }),

  http.post(`${p}/logout`, () => HttpResponse.json(ok({ loggedOut: true }))),

  http.get(`${p}/me`, ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(fail("UNAUTHENTICATED", "Missing token."), { status: 401 });
    }
    return HttpResponse.json(ok({ customer: CUSTOMER_PROFILE, emailVerified: true }));
  }),
];
