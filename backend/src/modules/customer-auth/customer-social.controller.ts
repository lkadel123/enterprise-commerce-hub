import type { Request, RequestHandler, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { OAuthProviderError, UnverifiedEmailError } from "./social/oauth-shared.js";
import { unauthorized } from "../../utils/ApiError.js";
import {
  exchangeFacebookCode,
  facebookAuthUrl,
  isFacebookConfigured,
} from "./social/facebook.js";
import {
  exchangeGoogleCode,
  googleAuthUrl,
  isGoogleConfigured,
} from "./social/google.js";
import { isSocialProvider, type SocialProvider } from "./customerSocialAccount.model.js";
import {
  CUSTOMER_OAUTH_CONSENT_COOKIE_NAME,
  CUSTOMER_OAUTH_STATE_COOKIE_NAME,
  CUSTOMER_REFRESH_COOKIE_NAME,
  CUSTOMER_SESSION_HINT_COOKIE_NAME,
  clearCustomerOAuthConsentCookieOptions,
  clearCustomerOAuthStateCookieOptions,
  customerOAuthConsentCookieOptions,
  customerOAuthStateCookieOptions,
  customerRefreshCookieOptions,
  customerSessionHintCookieOptions,
} from "./customer-cookie.js";
import {
  acceptSocialTermsAndCreate,
  isConsentRequired,
  resolveSocialSignIn,
} from "./customer-social.service.js";
import type { SocialIdentityInput } from "./customer-social.service.js";
import type { CustomerAuthContext } from "./customer-auth.types.js";

/**
 * Social sign-in controllers (Google / Facebook) — CUSTOMER accounts only.
 *
 * Flow (Authorization Code, server-side):
 *   GET /auth/customer/:provider          → 302 to the provider consent screen
 *   GET /auth/customer/:provider/callback → verify → resolve → 302 to storefront
 *
 * CSRF/state: a server-signed, short-lived, single-use state token is issued
 * as an HttpOnly cookie AND passed as the OAuth `state` parameter. The callback
 * accepts the round trip only when both values are present, equal, verifiable,
 * provider-matching, and not expired. The intended post-login redirect target
 * is bound INSIDE the signed state — it is never trusted from the callback URL.
 *
 * Errors NEVER leak internals: every failure lands on the storefront
 * `/auth/callback` page as a coarse, user-friendly error code.
 */

const STATE_JWT_PURPOSE = "customer-oauth-state";
const CONSENT_JWT_PURPOSE = "customer-oauth-consent";

/**
 * Signed, short-lived continuation token for the Terms & Conditions consent
 * step of a NEW social customer. Holds ONLY the provider-verified identity —
 * never provider access tokens or secrets. Delivered exclusively via an
 * HttpOnly cookie (no identity data ever appears in URLs or client storage)
 * and consumed once by POST /auth/customer/social/accept-terms.
 */
interface ConsentClaims extends JwtPayload {
  purpose: string;
  provider: SocialProvider;
  identity: SocialIdentityInput;
}

function signConsentToken(identity: SocialIdentityInput): string {
  const claims = {
    purpose: CONSENT_JWT_PURPOSE,
    provider: identity.provider,
    identity,
  };
  return jwt.sign(claims, env.CUSTOMER_JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: `${env.OAUTH_STATE_TTL_MINUTES}m`,
  });
}

function verifyConsentToken(token: string): SocialIdentityInput | null {
  try {
    const payload = jwt.verify(token, env.CUSTOMER_JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;
    const claims = payload as ConsentClaims;
    if (claims.purpose !== CONSENT_JWT_PURPOSE) return null;
    // The provider is INSIDE the server-signed token — a client can never
    // substitute another provider's identity by manipulating the request.
    if (!isSocialProvider(claims.provider)) return null;
    const identity = claims.identity;
    if (
      !identity ||
      identity.provider !== claims.provider ||
      typeof identity.providerUserId !== "string" ||
      identity.providerUserId === ""
    ) {
      return null;
    }
    // Only the fields the service needs — nothing client-controllable beyond
    // what the provider verified and we ourselves signed.
    return {
      provider: identity.provider,
      providerUserId: identity.providerUserId,
      email: identity.email ?? null,
      emailVerified: identity.emailVerified === true,
      name: identity.name ?? null,
      avatarUrl: identity.avatarUrl ?? null,
    };
  } catch {
    return null;
  }
}

/** Coarse error codes exposed to the storefront (never raw provider data). */
export type SocialAuthErrorCode =
  | "provider_not_configured"
  | "invalid_state"
  | "oauth_cancelled"
  | "oauth_failed"
  | "email_unavailable"
  | "email_unverified"
  | "account_suspended"
  | "account_conflict"
  | "provider_unavailable";

function storefrontCallbackUrl(params: {
  error?: SocialAuthErrorCode;
  redirect?: string;
  /** Signals the Terms & Conditions consent step (NOT an error). */
  terms?: boolean;
}): string {
  const url = new URL("/auth/callback", env.PUBLIC_BASE_URL);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.redirect) url.searchParams.set("redirect", params.redirect);
  if (params.terms) url.searchParams.set("terms", "1");
  return url.toString();
}

/**
 * Same open-redirect rules as the storefront `isSafeRedirect`: only relative,
 * same-origin paths starting with a single "/" are honoured.
 */
function isSafeRedirectTarget(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\") || value.startsWith("\\/")) return false;
  // Control characters would corrupt the Location header.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  return true;
}

interface StateClaims extends JwtPayload {
  purpose: typeof STATE_JWT_PURPOSE;
  provider: SocialProvider;
  redirect: string;
}

function signStateToken(provider: SocialProvider, redirect: string): string {
  const claims = { purpose: STATE_JWT_PURPOSE, provider, redirect };
  return jwt.sign(claims, env.CUSTOMER_JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    // Reuses the customer signing secret already guarded by the production
    // boot checks — no additional secret to manage. The `purpose` claim makes
    // confusion with customer access tokens (type "customer-access") impossible.
    expiresIn: `${env.OAUTH_STATE_TTL_MINUTES}m`,
  });
}

function verifyStateToken(token: string, provider: SocialProvider): StateClaims | null {
  try {
    const payload = jwt.verify(token, env.CUSTOMER_JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;
    const claims = payload as JwtPayload;
    if (claims.purpose !== STATE_JWT_PURPOSE) return null;
    if (claims.provider !== provider) return null;
    if (!isSafeRedirectTarget(claims.redirect)) return null;
    return claims as StateClaims;
  } catch {
    return null;
  }
}

function clientMeta(req: Request): CustomerAuthContext {
  const ua = req.headers["user-agent"];
  return {
    ua: typeof ua === "string" ? ua : undefined,
    ip: req.ip ?? req.socket.remoteAddress,
  };
}

/** Issues the SAME session cookies as the password login/register flows. */
function setSessionCookies(res: Response, result: { refreshToken: string; remember: boolean }): void {
  res.cookie(
    CUSTOMER_REFRESH_COOKIE_NAME,
    result.refreshToken,
    customerRefreshCookieOptions(result.remember),
  );
  res.cookie(
    CUSTOMER_SESSION_HINT_COOKIE_NAME,
    "1",
    customerSessionHintCookieOptions(result.remember),
  );
}

function clearStateCookie(res: Response): void {
  res.clearCookie(CUSTOMER_OAUTH_STATE_COOKIE_NAME, clearCustomerOAuthStateCookieOptions());
}

function noStore(res: Response): void {
  // OAuth responses must never be cached (they carry redirects + cookies).
  res.setHeader("Cache-Control", "no-store");
}

function startHandler(provider: SocialProvider): RequestHandler {
  return (req, res) => {
    const configured = provider === "google" ? isGoogleConfigured() : isFacebookConfigured();
    const rawRedirect = typeof req.query.redirect === "string" ? req.query.redirect : undefined;
    // Unsafe/absent redirect targets fall back to the account page — the value
    // is validated HERE and bound into the signed state, so an attacker cannot
    // inject an arbitrary URL through the callback either.
    const redirect = isSafeRedirectTarget(rawRedirect) ? rawRedirect : "/account";

    if (!configured) {
      // Fail fast with a friendly redirect — no provider details leaked.
      res.redirect(storefrontCallbackUrl({ error: "provider_not_configured", redirect }));
      return;
    }

    const state = signStateToken(provider, redirect);

    res.cookie(
      CUSTOMER_OAUTH_STATE_COOKIE_NAME,
      state,
      customerOAuthStateCookieOptions(env.OAUTH_STATE_TTL_MINUTES),
    );
    noStore(res);
    res.redirect(provider === "google" ? googleAuthUrl(state) : facebookAuthUrl(state));
  };
}

function mapSocialError(error: unknown): SocialAuthErrorCode {
  // Check account state BEFORE the generic provider-error branch so a refused
  // sign-in for a suspended account (even when the provider call also fails)
  // is still surfaced accurately.
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHENTICATED") return "account_suspended";
    if (error.code === "SERVICE_UNAVAILABLE") return "provider_unavailable";
  }
  // Must be checked BEFORE the generic OAuthProviderError branch.
  if (error instanceof UnverifiedEmailError) return "email_unverified";
  if (error instanceof OAuthProviderError) return "oauth_failed";
  if (error instanceof ApiError) {
    if (error.code === "CONFLICT") {
      return error.message.includes("email address") ? "email_unavailable" : "account_conflict";
    }
  }
  return "oauth_failed";
}

function callbackHandler(provider: SocialProvider): RequestHandler {
  return async (req, res, next) => {
    try {
      const queryState = typeof req.query.state === "string" ? req.query.state : undefined;
      const cookieState = req.cookies?.[CUSTOMER_OAUTH_STATE_COOKIE_NAME];

      // The state must be present in BOTH the cookie and the query, match
      // exactly, and verify (purpose/provider/expiry/redirect-safety).
      const stateClaims =
        typeof queryState === "string" &&
        typeof cookieState === "string" &&
        queryState === cookieState
          ? verifyStateToken(queryState, provider)
          : null;

      const fail = (error: SocialAuthErrorCode) => {
        // Single-use: always clear the state cookie, even on failure.
        clearStateCookie(res);
        const redirect = stateClaims?.redirect ?? "/account";
        noStore(res);
        res.redirect(storefrontCallbackUrl({ error, redirect }));
      };

      if (!stateClaims) {
        logger.warn({ provider }, "OAuth state validation failed");
        fail("invalid_state");
        return;
      }

      // User cancelled the consent screen (or the provider refused upfront).
      // access_denied / user_cancelled and any other provider-side refusal all
      // map to the same coarse "cancelled" outcome.
      const providerError = typeof req.query.error === "string" ? req.query.error : undefined;
      if (providerError) {
        fail("oauth_cancelled");
        return;
      }

      const code = typeof req.query.code === "string" ? req.query.code : undefined;
      if (!code) {
        fail("oauth_failed");
        return;
      }

      const verified =
        provider === "google" ? await exchangeGoogleCode(code) : await exchangeFacebookCode(code);

      const result = await resolveSocialSignIn(
        {
          provider,
          providerUserId: verified.providerUserId,
          email: verified.email,
          // Google: from the verified ID token. Facebook: email presence after
          // debug_token verification (Facebook only returns verified emails).
          emailVerified: provider === "google" ? verified.emailVerified : verified.email !== null,
          name: verified.name,
          avatarUrl: verified.avatarUrl,
        },
        clientMeta(req),
      );

      if (isConsentRequired(result)) {
        // NEW customer: no account exists yet. Hand the provider-verified
        // identity to the consent step via a signed, single-use, HttpOnly
        // continuation cookie — the account is created ONLY after explicit
        // Terms & Conditions acceptance (POST /social/accept-terms).
        clearStateCookie(res);
        noStore(res);
        res.cookie(
          CUSTOMER_OAUTH_CONSENT_COOKIE_NAME,
          signConsentToken({
            provider,
            providerUserId: verified.providerUserId,
            email: verified.email,
            emailVerified: provider === "google" ? verified.emailVerified : verified.email !== null,
            name: verified.name,
            avatarUrl: verified.avatarUrl,
          }),
          customerOAuthConsentCookieOptions(env.OAUTH_STATE_TTL_MINUTES),
        );
        res.redirect(storefrontCallbackUrl({ terms: true, redirect: stateClaims.redirect }));
        return;
      }

      // Same session mechanism as password login: httpOnly refresh cookie + hint.
      setSessionCookies(res, result);
      clearStateCookie(res);
      noStore(res);
      res.redirect(storefrontCallbackUrl({ redirect: stateClaims.redirect }));
    } catch (error) {
      // Map every failure to a coarse storefront error code (no internals).
      const mapped = mapSocialError(error);
      // Server-side diagnostics only — never sent to the client.
      logger.warn({ err: error, provider }, "Social sign-in failed");
      try {
        const cookieState = req.cookies?.[CUSTOMER_OAUTH_STATE_COOKIE_NAME];
        const claims =
          typeof cookieState === "string" ? verifyStateToken(cookieState, provider) : null;
        const redirect = claims?.redirect ?? "/account";
        clearStateCookie(res);
        noStore(res);
        res.redirect(storefrontCallbackUrl({ error: mapped, redirect }));
      } catch {
        next(error);
      }
    }
  };
}

/**
 * POST /auth/customer/social/accept-terms
 *
 * Completes a NEW social-customer registration after EXPLICIT Terms &
 * Conditions acceptance. The provider-verified identity comes EXCLUSIVELY
 * from the signed HttpOnly consent cookie — never from the request body —
 * so a client cannot forge or substitute an identity, and no account can be
 * created without the literal `acceptedTerms: true` enforced by the
 * request-validator middleware. Re-checks duplicate/social-link races
 * immediately before creation and issues the SAME session mechanism as
 * every other customer sign-in.
 */
const acceptTermsHandler: RequestHandler = asyncHandler(async (req, res) => {
  // The provider-verified identity comes EXCLUSIVELY from the signed consent
  // cookie (provider included); the body carries nothing but the
  // already-validated literal `acceptedTerms: true`.
  const consentToken = req.cookies?.[CUSTOMER_OAUTH_CONSENT_COOKIE_NAME];
  const identity = typeof consentToken === "string" ? verifyConsentToken(consentToken) : null;

  if (!identity) {
    // Single-use: clear even on failure so a stale/expired consent can never
    // be retried.
    res.clearCookie(
      CUSTOMER_OAUTH_CONSENT_COOKIE_NAME,
      clearCustomerOAuthConsentCookieOptions(),
    );
    throw unauthorized(
      "Your sign-in session expired. Please sign in with the provider again.",
    );
  }

  const result = await acceptSocialTermsAndCreate(identity, clientMeta(req));

  // Single-use consumed + same session cookies as password register/login.
  res.clearCookie(
    CUSTOMER_OAUTH_CONSENT_COOKIE_NAME,
    clearCustomerOAuthConsentCookieOptions(),
  );
  res.cookie(
    CUSTOMER_REFRESH_COOKIE_NAME,
    result.refreshToken,
    customerRefreshCookieOptions(result.remember),
  );
  res.cookie(
    CUSTOMER_SESSION_HINT_COOKIE_NAME,
    "1",
    customerSessionHintCookieOptions(result.remember),
  );

  sendSuccess(
    res,
    {
      customer: result.customer,
      accessToken: result.accessToken,
      remember: result.remember,
    },
    "Account created successfully",
    201,
  );
});

/** Public controller surface. */
export const customerSocialController = {
  googleStart: startHandler("google"),
  googleCallback: callbackHandler("google"),
  facebookStart: startHandler("facebook"),
  facebookCallback: callbackHandler("facebook"),
  acceptTerms: acceptTermsHandler,
};
