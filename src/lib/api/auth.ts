import { adminFetch } from "./client";
import type { AuthProfile, AuthSessionResult, LoginInput } from "./types";

/**
 * Admin authentication — reuses the backend's existing secure session
 * architecture verbatim (backend/src/modules/auth):
 *
 * - POST /auth/login returns `{ user, accessToken, permissions }` and sets the
 *   admin refresh token as an httpOnly cookie (path /api/v1/auth). The refresh
 *   token is never returned in the body and never readable by this app.
 * - POST /auth/refresh rotates the cookie and returns a fresh access token.
 * - POST /auth/logout revokes the refresh session and clears the cookie.
 * - GET /auth/me (Bearer) restores the profile from an access token.
 */
export const adminAuthApi = {
  login(body: LoginInput): Promise<{ data: AuthSessionResult }> {
    return adminFetch<AuthSessionResult>("/auth/login", { method: "POST", body });
  },

  refresh(): Promise<{ data: AuthSessionResult }> {
    // credentials:true so the httpOnly refresh cookie is transmitted.
    return adminFetch<AuthSessionResult>("/auth/refresh", { method: "POST" });
  },

  logout(): Promise<{ data: { loggedOut: boolean } }> {
    return adminFetch<{ loggedOut: boolean }>("/auth/logout", { method: "POST" });
  },

  me(): Promise<{ data: AuthProfile }> {
    return adminFetch<AuthProfile>("/auth/me");
  },
};
