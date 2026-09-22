import type { CustomerAuthProfile, CustomerProfileResult } from "@/types";

import { apiFetch, setAccessToken } from "./client";

/**
 * Auth API envelope: `{ success: true, data: T, message? }`.
 */
export interface CustomerApiEnvelope<T> {
  success: true;
  data: T;
  message?: string;
}

export interface CustomerLoginResult {
  customer: CustomerAuthProfile;
  accessToken: string;
  remember: boolean;
}

export interface CustomerRegisterResult {
  customer: CustomerAuthProfile;
  accessToken: string;
  remember: boolean;
}

export interface CustomerRefreshResult {
  customer: CustomerAuthProfile;
  accessToken: string;
  remember: boolean;
}

export interface CustomerLogoutResult {
  loggedOut: boolean;
}

export interface CustomerRegisterInput {
  name: string;
  email: string;
  password: string;
  /** Must be the literal `true` — the backend rejects anything else (422). */
  acceptedTerms: true;
}

export interface CustomerLoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

/**
 * Customer authentication API client.
 *
 * Mirrors the backend `customer-auth` module routes mounted at
 * `/api/v1/auth/customer` (see `backend/src/modules/customer-auth/customer-auth.routes.ts`).
 *
 * All calls use `credentials: "include"` (the `apiFetch` default) so the
 * httpOnly `customer_refresh_token` cookie is BOTH set on login/register and
 * sent on refresh/logout. Omitting credentials on login/register would make
 * the browser discard the `Set-Cookie` response entirely, breaking session
 * persistence. A stale cookie sent along is harmless — the backend rotates it.
 *
 * After login/register/refresh, the caller (CustomerAuthContext) stores the
 * returned access token in memory via `setAccessToken`.
 */
export const customerAuthApi = {
  register(body: CustomerRegisterInput): Promise<CustomerApiEnvelope<CustomerRegisterResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerRegisterResult>>("/auth/customer/register", {
      method: "POST",
      body,
    });
  },

  /**
   * POST /auth/customer/social/accept-terms — completes a NEW Google/Facebook
   * customer registration after explicit Terms & Conditions acceptance.
   * The provider identity travels only in the server-side signed, single-use
   * consent cookie (never in the URL or any client-readable storage). The
   * response establishes the SAME session mechanism as register/login.
   */
  acceptSocialTerms(body: {
    acceptedTerms: true;
  }): Promise<CustomerApiEnvelope<CustomerRegisterResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerRegisterResult>>(
      "/auth/customer/social/accept-terms",
      {
        method: "POST",
        body,
      },
    );
  },

  login(body: CustomerLoginInput): Promise<CustomerApiEnvelope<CustomerLoginResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerLoginResult>>("/auth/customer/login", {
      method: "POST",
      body,
    });
  },

  refresh(): Promise<CustomerApiEnvelope<CustomerRefreshResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerRefreshResult>>("/auth/customer/refresh", {
      method: "POST",
    });
  },

  logout(): Promise<CustomerApiEnvelope<CustomerLogoutResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerLogoutResult>>("/auth/customer/logout", {
      method: "POST",
    });
  },

  me(): Promise<CustomerApiEnvelope<CustomerProfileResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerProfileResult>>("/auth/customer/me");
  },

  /**
   * POST /auth/customer/forgot-password — stages a password-reset request and
   * emails a one-time link. The response is account-existence-neutral: the
   * same message is returned whether or not the email is registered. The
   * backend returns 503 when SMTP delivery is not configured — surface that
   * as "temporarily unavailable", never as "email sent".
   */
  forgotPassword(body: { email: string }): Promise<CustomerApiEnvelope<{ requestId: string }>> {
    return apiFetch<CustomerApiEnvelope<{ requestId: string }>>("/auth/customer/forgot-password", {
      method: "POST",
      body,
    });
  },

  /**
   * POST /auth/customer/reset-password — consumes a one-time requestId+token
   * (from the emailed link) and sets a new password. Invalid/expired/used
   * tokens are rejected with 401 by the backend; the raw token never leaves
   * the query string of the emailed link.
   */
  resetPassword(body: {
    requestId: string;
    token: string;
    newPassword: string;
  }): Promise<CustomerApiEnvelope<{ reset: boolean }>> {
    return apiFetch<CustomerApiEnvelope<{ reset: boolean }>>("/auth/customer/reset-password", {
      method: "POST",
      body,
    });
  },

  changePassword(body: {
    currentPassword: string;
    newPassword: string;
  }): Promise<CustomerApiEnvelope<{ changed: boolean }>> {
    return apiFetch<CustomerApiEnvelope<{ changed: boolean }>>("/auth/customer/change-password", {
      method: "POST",
      body,
    });
  },

  /** PATCH /auth/customer/profile — update name/phone (email is immutable). */
  updateProfile(body: {
    name?: string;
    phone?: string;
  }): Promise<CustomerApiEnvelope<CustomerProfileResult>> {
    return apiFetch<CustomerApiEnvelope<CustomerProfileResult>>("/auth/customer/profile", {
      method: "PATCH",
      body,
    });
  },
};

// Re-export the in-memory token setter so the auth context can publish tokens
export { setAccessToken, configureClient, ApiClientError } from "./client";
export type { ApiFieldError } from "@/types";
