import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, type JsonWebKey } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";

import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCustomerAccount, customerRefreshCookie } from "./helpers/fixtures.js";
import { UserModel } from "../src/modules/users/user.model.js";
import { CustomerAccountModel } from "../src/modules/customer-auth/customerAccount.model.js";
import {
  CustomerSocialAccountModel,
  type SocialProvider,
} from "../src/modules/customer-auth/customerSocialAccount.model.js";
import { env } from "../src/config/env.js";

const app = getApp();

/**
 * Social sign-in (Google / Facebook) integration tests.
 *
 * Provider HTTP calls are mocked at the `fetch` boundary — the real Google
 * ID-token signature verification (RS256 via JWKS) and the real Facebook
 * flow (code → debug_token → /me) execute end-to-end server-side against
 * the mocked endpoints, using a real test RSA keypair.
 */

const KID = "test-signing-key-1";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;

const TEST_JWKS = {
  keys: [{ ...publicJwk, kid: KID, use: "sig", alg: "RS256" }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface GoogleProfileInput {
  sub: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  iss?: string;
  aud?: string;
  kid?: string;
  /** Optional signing key override (e.g. for forged-signature tests). */
  key?: unknown;
}

function googleIdToken(profile: GoogleProfileInput): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: profile.iss ?? "https://accounts.google.com",
      aud: profile.aud ?? env.GOOGLE_CLIENT_ID,
      iat: now,
      exp: now + 3600,
      sub: profile.sub,
      email: profile.email,
      email_verified: profile.emailVerified ?? true,
      name: profile.name ?? "Google User",
      ...(profile.picture ? { picture: profile.picture } : {}),
    },
    (profile.key ?? privateKey) as never,
    { algorithm: "RS256", header: { kid: profile.kid ?? KID, alg: "RS256", typ: "JWT" } },
  );
}

/** Installs a mocked global `fetch` routed by URL; returns the mock. */
function installFetch(
  handler: (url: string) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | { url: string }): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as { url: string }).url;
    return handler(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function installGoogleSuccess(profile: GoogleProfileInput) {
  return installFetch((url) => {
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
      return jsonResponse(TEST_JWKS);
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return jsonResponse({ id_token: googleIdToken(profile) });
    }
    throw new Error(`Unexpected fetch in Google test: ${url}`);
  });
}

/** Mock Facebook's code → token → debug_token → /me chain. */
function installFacebookSuccess(me: { fbUserId: string; name?: string; email?: string }) {
  return installFetch((url) => {
    if (url.startsWith("https://graph.facebook.com/v21.0/oauth/access_token")) {
      return jsonResponse({ access_token: "fb-user-token-123" });
    }
    if (url.startsWith("https://graph.facebook.com/v21.0/debug_token")) {
      return jsonResponse({
        data: {
          is_valid: true,
          app_id: env.FACEBOOK_APP_ID,
          user_id: me.fbUserId,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });
    }
    if (url.startsWith("https://graph.facebook.com/v21.0/me")) {
      return jsonResponse({
        id: me.fbUserId,
        name: me.name ?? "Facebook User",
        ...(me.email ? { email: me.email } : {}),
      });
    }
    throw new Error(`Unexpected fetch in Facebook test: ${url}`);
  });
}

async function startOAuth(provider: SocialProvider, redirect?: string) {
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const path = `/api/v1/auth/customer/${provider}${query}`;
  const res = await request(app).get(path).redirects(0);
  expect(res.status).toBe(302);
  const location = res.headers["location"];
  if (typeof location !== "string") throw new Error("Missing Location header");
  const state = new URL(location).searchParams.get("state");
  const setCookie = Array.isArray(res.headers["set-cookie"])
    ? res.headers["set-cookie"].join(";")
    : String(res.headers["set-cookie"] ?? "");
  const stateCookie = setCookie.match(/customer_oauth_state=([^;]+)/)?.[1] ?? "";
  return { res, location, state, stateCookie };
}

async function callbackOAuth(
  provider: SocialProvider,
  state: string | null,
  stateCookie: string,
  opts: { code?: string; errorParam?: string } = {},
) {
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  if (opts.code !== undefined) params.set("code", opts.code);
  if (opts.errorParam !== undefined) params.set("error", opts.errorParam);
  const path = `/api/v1/auth/customer/${provider}/callback?${params.toString()}`;
  const cookie = stateCookie ? `customer_oauth_state=${stateCookie}` : "";
  const req = request(app).get(path).redirects(0);
  if (cookie) req.set("Cookie", cookie);
  return req;
}

/** Structural slice of a supertest response used for redirect assertions. */
interface RedirectResponse {
  headers: { location?: string | string[] };
}

function callbackTarget(res: RedirectResponse): URL {
  const location = res.headers["location"];
  if (typeof location !== "string") throw new Error("Missing Location header");
  return new URL(location);
}

/** Completes a full Google social sign-in (start → callback). */
async function completeGoogleSignIn(profile: GoogleProfileInput, redirect?: string) {
  installGoogleSuccess(profile);
  const { state, stateCookie } = await startOAuth("google", redirect);
  const res = await callbackOAuth("google", state, stateCookie, { code: "google-auth-code-1" });
  return res;
}

/**
 * Completes the Terms & Conditions consent step for a NEW social customer:
 * POST /auth/customer/social/accept-terms with the signed consent cookie
 * from the callback response. Returns the accept-terms response.
 */
type CallbackResponse = Awaited<ReturnType<typeof callbackOAuth>>;

/** Extracts Set-Cookie values from a supertest response. */
function setCookieValues(res: CallbackResponse): string[] {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw : [String(raw ?? "")];
}

async function acceptTermsFromCallback(callbackRes: CallbackResponse) {
  const setCookies = setCookieValues(callbackRes);
  const consent = setCookies
    .find((c: string) => c.startsWith("customer_oauth_consent="))
    ?.match(/customer_oauth_consent=([^;]+)/)?.[1];
  if (!consent) throw new Error("Missing customer_oauth_consent cookie in callback response");
  return request(app)
    .post("/api/v1/auth/customer/social/accept-terms")
    .set("Cookie", `customer_oauth_consent=${consent}`)
    .send({ acceptedTerms: true });
}

/**
 * Full NEW-customer social flow: provider verification → consent redirect →
 * explicit acceptance → account creation. Returns the accept-terms response.
 */
async function completeNewSocialCustomer(
  signIn: () => Promise<Awaited<ReturnType<typeof callbackOAuth>>>,
) {
  const callbackRes = await signIn();
  expect(callbackRes.status).toBe(302);
  const target = callbackTarget(callbackRes);
  expect(target.searchParams.get("terms")).toBe("1");
  // The consent continuation is HttpOnly — no identity in the URL.
  expect(target.searchParams.get("provider")).toBeNull();
  return acceptTermsFromCallback(callbackRes);
}

/** Completes a full Facebook social sign-in (start → callback). */
async function completeFacebookSignIn(
  me: { fbUserId: string; name?: string; email?: string },
  redirect?: string,
) {
  installFacebookSuccess(me);
  const { state, stateCookie } = await startOAuth("facebook", redirect);
  const res = await callbackOAuth("facebook", state, stateCookie, { code: "fb-auth-code-1" });
  return res;
}

describe("Customer social authentication (Google / Facebook)", () => {
  beforeAll(async () => {
    await connect();
  });
  beforeEach(async () => {
    await clearDatabase();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await disconnect();
  });

  describe("Google", () => {
    it("requires Terms acceptance before creating a CUSTOMER account on first Google sign-in", async () => {
      const callbackRes = await completeGoogleSignIn({
        sub: "google-user-1",
        email: "gl@test.com",
      });

      // Provider verified, but NO account exists yet — consent redirect only.
      expect(callbackRes.status).toBe(302);
      const target = callbackTarget(callbackRes);
      expect(target.origin).toBe(env.PUBLIC_BASE_URL);
      expect(target.pathname).toBe("/auth/callback");
      expect(target.searchParams.get("terms")).toBe("1");
      expect(target.searchParams.get("redirect")).toBe("/account");
      expect(await CustomerAccountModel.countDocuments({ email: "gl@test.com" })).toBe(0);
      expect(await CustomerSocialAccountModel.countDocuments({ provider: "google" })).toBe(0);

      // Explicit acceptance creates the CUSTOMER with the same session cookies.
      const res = await acceptTermsFromCallback(callbackRes);
      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBeTruthy();
      expect(customerRefreshCookie(res.headers["set-cookie"])).toBeTruthy();
      expect(res.headers["set-cookie"]?.[0]).toContain("HttpOnly");

      const { CURRENT_TERMS_VERSION } = await import("../src/constants/terms.js");
      const account = await CustomerAccountModel.findOne({ email: "gl@test.com" }).lean().exec();
      expect(account).toBeTruthy();
      expect(account!.status).toBe("Active");
      expect(account!.emailVerifiedAt).toBeInstanceOf(Date);
      expect(account!.termsAcceptedAt).toBeInstanceOf(Date);
      expect(account!.termsVersion).toBe(CURRENT_TERMS_VERSION);

      const social = await CustomerSocialAccountModel.findOne({ provider: "google" }).lean().exec();
      expect(social).toBeTruthy();
      expect(social!.providerUserId).toBe("google-user-1");
      expect(social!.accountId.toString()).toBe(account!._id.toString());

      // Social sign-in must NEVER touch the admin User collection.
      expect(await UserModel.countDocuments()).toBe(0);

      // Password authentication is NOT weakened: the unusable hash rejects logins.
      const pwLogin = await request(app)
        .post("/api/v1/auth/customer/login")
        .send({ email: "gl@test.com", password: "not-the-password" });
      expect(pwLogin.status).toBe(401);
    });

    it("authenticates an existing Google customer without duplicating the account", async () => {
      await completeNewSocialCustomer(() =>
        completeGoogleSignIn({ sub: "google-user-2", email: "g2@test.com" }),
      );
      await completeGoogleSignIn({ sub: "google-user-2", email: "g2@test.com" });

      expect(await CustomerAccountModel.countDocuments({ email: "g2@test.com" })).toBe(1);
      expect(await CustomerSocialAccountModel.countDocuments({ provider: "google" })).toBe(1);
      expect(await UserModel.countDocuments()).toBe(0);
    });

    it("securely links Google to an existing customer with the same verified email", async () => {
      await seedCustomerAccount({ email: "link@test.com", name: "Linky" });
      const res = await completeGoogleSignIn({ sub: "google-user-3", email: "link@test.com" });

      expect(res.status).toBe(302);
      // No duplicate account created — the social identity is linked to it.
      expect(await CustomerAccountModel.countDocuments({ email: "link@test.com" })).toBe(1);
      const social = await CustomerSocialAccountModel.findOne({ provider: "google" }).lean().exec();
      const account = await CustomerAccountModel.findOne({ email: "link@test.com" }).lean().exec();
      expect(social!.accountId.toString()).toBe(account!._id.toString());
      expect(customerRefreshCookie(res.headers["set-cookie"])).toBeTruthy();
    });

    it("does not claim an existing account when Google reports an unverified email", async () => {
      await seedCustomerAccount({ email: "uv@test.com" });
      const res = await completeGoogleSignIn({
        sub: "google-user-uv",
        email: "uv@test.com",
        emailVerified: false,
      });

      expect(res.status).toBe(302);
      expect(callbackTarget(res).searchParams.get("error")).toBe("email_unverified");
      // The existing password account must not gain a social link.
      expect(await CustomerSocialAccountModel.countDocuments()).toBe(0);
      expect(await CustomerAccountModel.countDocuments({ email: "uv@test.com" })).toBe(1);
    });

    it("rejects an invalid Google token (wrong signature) with a friendly error", async () => {
      // Signed by a DIFFERENT keypair → signature must fail verification.
      const { privateKey: attackerKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
      installFetch((url) => {
        if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
          return jsonResponse(TEST_JWKS);
        }
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return jsonResponse({
            id_token: googleIdToken({
              sub: "google-forger",
              email: "forged@test.com",
              key: attackerKey,
            }),
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      const { state, stateCookie } = await startOAuth("google");
      const res = await callbackOAuth("google", state, stateCookie, { code: "bad-code" });

      expect(callbackTarget(res).searchParams.get("error")).toBe("oauth_failed");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });

    it("rejects a token with the wrong audience", async () => {
      installFetch((url) => {
        if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
          return jsonResponse(TEST_JWKS);
        }
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return jsonResponse({
            id_token: googleIdToken({
              sub: "google-other-app",
              email: "other-app@test.com",
              aud: "some-other-client-id.apps.googleusercontent.com",
            }),
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      const { state, stateCookie } = await startOAuth("google");
      const res = await callbackOAuth("google", state, stateCookie, { code: "bad-aud" });
      expect(callbackTarget(res).searchParams.get("error")).toBe("oauth_failed");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });

    it("handles OAuth cancellation as a friendly error", async () => {
      const { state, stateCookie } = await startOAuth("google");
      const res = await callbackOAuth("google", state, stateCookie, {
        errorParam: "access_denied",
      });
      expect(callbackTarget(res).searchParams.get("error")).toBe("oauth_cancelled");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });

    it("rejects a missing/mismatched OAuth state (CSRF protection)", async () => {
      const { state } = await startOAuth("google");

      // No state cookie sent at all.
      const resNoCookie = await callbackOAuth("google", state, "", { code: "x" });
      expect(callbackTarget(resNoCookie).searchParams.get("error")).toBe("invalid_state");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);

      // Cookie and query state mismatch.
      const resMismatch = await callbackOAuth("google", "forged-state", "real-cookie-value", {
        code: "x",
      });
      expect(callbackTarget(resMismatch).searchParams.get("error")).toBe("invalid_state");
    });

    it("preserves a safe redirect target after login (checkout flow)", async () => {
      const res = await completeGoogleSignIn(
        { sub: "google-user-4", email: "g4@test.com" },
        "/checkout",
      );
      expect(callbackTarget(res).searchParams.get("redirect")).toBe("/checkout");
    });

    it("never honours an unsafe redirect target (no open redirects)", async () => {
      const res = await completeGoogleSignIn(
        { sub: "google-user-5", email: "g5@test.com" },
        "https://evil.example/phish",
      );
      const target = callbackTarget(res);
      expect(target.searchParams.get("redirect")).toBe("/account");
      expect(target.origin).toBe(env.PUBLIC_BASE_URL);
      expect(target.toString()).not.toContain("evil.example");

      // Protocol-relative target is also rejected.
      const res2 = await completeGoogleSignIn(
        { sub: "google-user-6", email: "g6@test.com" },
        "//evil.example",
      );
      expect(callbackTarget(res2).searchParams.get("redirect")).toBe("/account");
    });
  });

  describe("Facebook", () => {
    it("creates a CUSTOMER account on first Facebook sign-in only after Terms acceptance", async () => {
      const callbackRes = await completeFacebookSignIn(
        { fbUserId: "fb-user-1", name: "FB One", email: "fb1@test.com" },
        "/account/orders",
      );

      // Provider verified, but NO account exists yet.
      expect(callbackRes.status).toBe(302);
      const target = callbackTarget(callbackRes);
      expect(target.searchParams.get("terms")).toBe("1");
      expect(target.searchParams.get("redirect")).toBe("/account/orders");
      expect(await CustomerAccountModel.countDocuments({ email: "fb1@test.com" })).toBe(0);

      const res = await acceptTermsFromCallback(callbackRes);
      expect(res.status).toBe(201);
      expect(customerRefreshCookie(res.headers["set-cookie"])).toBeTruthy();

      const { CURRENT_TERMS_VERSION } = await import("../src/constants/terms.js");
      const account = await CustomerAccountModel.findOne({ email: "fb1@test.com" }).lean().exec();
      expect(account).toBeTruthy();
      expect(account!.termsAcceptedAt).toBeInstanceOf(Date);
      expect(account!.termsVersion).toBe(CURRENT_TERMS_VERSION);
      const social = await CustomerSocialAccountModel.findOne({ provider: "facebook" })
        .lean()
        .exec();
      expect(social!.providerUserId).toBe("fb-user-1");
      expect(await UserModel.countDocuments()).toBe(0);
    });

    it("authenticates an existing Facebook customer without duplicating the account", async () => {
      await completeNewSocialCustomer(() =>
        completeFacebookSignIn({ fbUserId: "fb-user-2", email: "fb2@test.com" }),
      );
      await completeFacebookSignIn({ fbUserId: "fb-user-2", email: "fb2@test.com" });
      expect(await CustomerAccountModel.countDocuments({ email: "fb2@test.com" })).toBe(1);
      expect(await CustomerSocialAccountModel.countDocuments({ provider: "facebook" })).toBe(1);
    });

    it("securely links Facebook to an existing customer with the same email", async () => {
      await seedCustomerAccount({ email: "fblink@test.com" });
      const res = await completeFacebookSignIn({
        fbUserId: "fb-user-3",
        email: "fblink@test.com",
      });
      expect(res.status).toBe(302);
      expect(await CustomerAccountModel.countDocuments({ email: "fblink@test.com" })).toBe(1);
      const social = await CustomerSocialAccountModel.findOne({ provider: "facebook" })
        .lean()
        .exec();
      const account = await CustomerAccountModel.findOne({ email: "fblink@test.com" })
        .lean()
        .exec();
      expect(social!.accountId.toString()).toBe(account!._id.toString());
    });

    it("surfaces a friendly error when Facebook does not provide an email", async () => {
      const res = await completeFacebookSignIn({ fbUserId: "fb-no-email", name: "No Mail" });

      expect(res.status).toBe(302);
      expect(callbackTarget(res).searchParams.get("error")).toBe("email_unavailable");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
      expect(await CustomerSocialAccountModel.countDocuments()).toBe(0);
    });

    it("rejects an invalid Facebook token (debug_token invalid)", async () => {
      installFetch((url) => {
        if (url.startsWith("https://graph.facebook.com/v21.0/oauth/access_token")) {
          return jsonResponse({ access_token: "forged-fb-token" });
        }
        if (url.startsWith("https://graph.facebook.com/v21.0/debug_token")) {
          return jsonResponse({ data: { is_valid: false, app_id: env.FACEBOOK_APP_ID } });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const { state, stateCookie } = await startOAuth("facebook");
      const res = await callbackOAuth("facebook", state, stateCookie, { code: "bad-fb-code" });
      expect(callbackTarget(res).searchParams.get("error")).toBe("oauth_failed");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });

    it("rejects a token issued to a DIFFERENT app id", async () => {
      installFetch((url) => {
        if (url.startsWith("https://graph.facebook.com/v21.0/oauth/access_token")) {
          return jsonResponse({ access_token: "other-app-token" });
        }
        if (url.startsWith("https://graph.facebook.com/v21.0/debug_token")) {
          return jsonResponse({
            data: {
              is_valid: true,
              app_id: "999999999999999",
              user_id: "fb-user-other",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const { state, stateCookie } = await startOAuth("facebook");
      const res = await callbackOAuth("facebook", state, stateCookie, { code: "x" });
      expect(callbackTarget(res).searchParams.get("error")).toBe("oauth_failed");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });

    it("rejects a profile whose /me id disagrees with debug_token (identity mismatch)", async () => {
      installFetch((url) => {
        if (url.startsWith("https://graph.facebook.com/v21.0/oauth/access_token")) {
          return jsonResponse({ access_token: "fb-user-token" });
        }
        if (url.startsWith("https://graph.facebook.com/v21.0/debug_token")) {
          return jsonResponse({
            data: {
              is_valid: true,
              app_id: env.FACEBOOK_APP_ID,
              user_id: "fb-user-real",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          });
        }
        if (url.startsWith("https://graph.facebook.com/v21.0/me")) {
          return jsonResponse({
            id: "fb-user-IMPERSONATOR",
            name: "Attacker",
            email: "victim@test.com",
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const { state, stateCookie } = await startOAuth("facebook");
      const res = await callbackOAuth("facebook", state, stateCookie, { code: "x" });

      // The impersonated victim must NOT get linked/created.
      expect(callbackTarget(res).searchParams.get("error")).toBe("oauth_failed");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
      expect(await CustomerSocialAccountModel.countDocuments()).toBe(0);
    });

    it("handles OAuth cancellation and invalid state", async () => {
      const { state, stateCookie } = await startOAuth("facebook");
      const cancelled = await callbackOAuth("facebook", state, stateCookie, {
        errorParam: "user_cancelled",
      });
      expect(callbackTarget(cancelled).searchParams.get("error")).toBe("oauth_cancelled");

      const noCookie = await callbackOAuth("facebook", state, "", { code: "x" });
      expect(callbackTarget(noCookie).searchParams.get("error")).toBe("invalid_state");
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });
  });

  describe("Security", () => {
    it("can never create ADMIN or SUPER_ADMIN users through social login", async () => {
      await completeNewSocialCustomer(() =>
        completeGoogleSignIn({ sub: "g-sec-1", email: "sec1@test.com" }),
      );
      await completeNewSocialCustomer(() =>
        completeFacebookSignIn({ fbUserId: "fb-sec-1", email: "sec2@test.com" }),
      );

      expect(await UserModel.countDocuments()).toBe(0);
      const admins = await UserModel.find({ role: { $in: ["Admin", "Super Admin"] } })
        .lean()
        .exec();
      expect(admins).toHaveLength(0);

      // A customer access token from the created account is rejected on admin routes.
      const account = await CustomerAccountModel.findOne({ email: "sec1@test.com" }).lean().exec();
      const { signCustomerAccessToken } =
        await import("../src/modules/customer-auth/customer-token.js");
      const customerToken = signCustomerAccessToken(account!._id.toString());
      const adminUsers = await request(app)
        .get("/api/v1/users")
        .set("Authorization", `Bearer ${customerToken}`);
      expect(adminUsers.status).toBe(401);
    });

    it("cannot bypass password authentication with a social identity", async () => {
      await completeNewSocialCustomer(() =>
        completeGoogleSignIn({ sub: "g-sec-2", email: "pw-sec@test.com" }),
      );

      const res = await request(app)
        .post("/api/v1/auth/customer/login")
        .send({ email: "pw-sec@test.com", password: "superadmin123" });
      expect(res.status).toBe(401);

      // Admin login with a social email is also impossible (separate collections).
      const adminLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "pw-sec@test.com", password: "superadmin123" });
      expect(adminLogin.status).toBe(401);
    });

    it("a social identity linked to one account can never claim a second account", async () => {
      // First sign-in creates account A (owner email) via the consent step.
      await completeNewSocialCustomer(() =>
        completeGoogleSignIn({ sub: "g-sec-3", email: "owner@test.com" }),
      );
      // An attacker already holds account B with a DIFFERENT email.
      await seedCustomerAccount({ email: "victim@test.com" });

      // The same Google identity now tries to sign in with the victim's email.
      const res = await completeGoogleSignIn({ sub: "g-sec-3", email: "victim@test.com" });

      // Resolution follows the EXISTING link (account A) — the victim account
      // is untouched and no second social link exists.
      expect(res.status).toBe(302);
      expect(callbackTarget(res).searchParams.get("error")).toBeNull();
      const socials = await CustomerSocialAccountModel.find({ provider: "google" }).lean().exec();
      expect(socials).toHaveLength(1);
      const owner = await CustomerAccountModel.findOne({ email: "owner@test.com" }).lean().exec();
      expect(socials[0]!.accountId.toString()).toBe(owner!._id.toString());
      expect(await CustomerAccountModel.countDocuments({ email: "victim@test.com" })).toBe(1);
    });

    it("issues the state cookie as HttpOnly (server-side CSRF protection)", async () => {
      const { res } = await startOAuth("google", "/account");
      const setCookies = setCookieValues(res);
      const stateCookie = setCookies.find((c: string) => c.startsWith("customer_oauth_state="));
      expect(stateCookie).toBeTruthy();
      expect(stateCookie).toContain("HttpOnly");
      expect(stateCookie).toContain("SameSite=Lax");
      expect(stateCookie).toContain("Path=/api/v1/auth/customer");
    });

    it("issues the consent cookie as HttpOnly with no identity in the redirect URL", async () => {
      installGoogleSuccess({ sub: "g-consent-1", email: "consent1@test.com" });
      const { state, stateCookie } = await startOAuth("google");
      const res = await callbackOAuth("google", state, stateCookie, { code: "consent-code" });

      expect(res.status).toBe(302);
      const target = callbackTarget(res);
      expect(target.searchParams.get("terms")).toBe("1");
      const setCookies = setCookieValues(res);
      const consent = setCookies.find((c: string) => c.startsWith("customer_oauth_consent="));
      expect(consent).toBeTruthy();
      expect(consent).toContain("HttpOnly");
      expect(consent).toContain("SameSite=Lax");
      // No provider identity, email, or tokens in the redirect URL.
      const url = target.toString();
      expect(url).not.toContain("consent1@test.com");
      expect(url).not.toContain("g-consent-1");
      expect(url).not.toContain("id_token");
      expect(url).not.toContain("access_token");
    });

    it("rejects accept-terms without a consent cookie (no account created)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .send({ acceptedTerms: true });

      expect(res.status).toBe(401);
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
      expect(await CustomerSocialAccountModel.countDocuments()).toBe(0);
    });

    it("rejects accept-terms with acceptedTerms=false or missing", async () => {
      installGoogleSuccess({ sub: "g-consent-2", email: "consent2@test.com" });
      const { state, stateCookie } = await startOAuth("google");
      const callbackRes = await callbackOAuth("google", state, stateCookie, { code: "c2" });
      const setCookies = setCookieValues(callbackRes);
      const consent = setCookies
        .find((c: string) => c.startsWith("customer_oauth_consent="))
        ?.match(/customer_oauth_consent=([^;]+)/)?.[1];
      expect(consent).toBeTruthy();

      const badFalse = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .set("Cookie", `customer_oauth_consent=${consent}`)
        .send({ acceptedTerms: false });
      expect(badFalse.status).toBe(422);

      const badMissing = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .set("Cookie", `customer_oauth_consent=${consent}`)
        .send({});
      expect(badMissing.status).toBe(422);

      // The body-only attack created nothing; the consent is still single-use
      // capable, so a real acceptance afterwards still works once.
      const ok = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .set("Cookie", `customer_oauth_consent=${consent}`)
        .send({ acceptedTerms: true });
      expect(ok.status).toBe(201);
      expect(await CustomerAccountModel.countDocuments({ email: "consent2@test.com" })).toBe(1);
    });

    it("rejects a forged consent cookie (no account created)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .set("Cookie", "customer_oauth_consent=forged-token-value")
        .send({ acceptedTerms: true });

      expect(res.status).toBe(401);
      expect(await CustomerAccountModel.countDocuments()).toBe(0);
    });

    it("consumes the consent cookie exactly once (replay is rejected)", async () => {
      const acceptRes = await completeNewSocialCustomer(() =>
        completeGoogleSignIn({ sub: "g-consent-3", email: "consent3@test.com" }),
      );
      expect(acceptRes.status).toBe(201);
      const setCookies = setCookieValues(acceptRes);
      // The accept-terms response clears the consent cookie.
      const cleared = setCookies.find((c: string) => c.startsWith("customer_oauth_consent="));
      expect(cleared).toBeTruthy();

      // A second accept-terms call without a fresh consent is rejected.
      const replay = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .send({ acceptedTerms: true });
      expect(replay.status).toBe(401);
      expect(await CustomerAccountModel.countDocuments({ email: "consent3@test.com" })).toBe(1);
    });

    it("accept-terms cannot inject a role or create an admin (body is literal-only)", async () => {
      installGoogleSuccess({ sub: "g-consent-4", email: "consent4@test.com" });
      const { state, stateCookie } = await startOAuth("google");
      const callbackRes = await callbackOAuth("google", state, stateCookie, { code: "c4" });
      const setCookies = setCookieValues(callbackRes);
      const consent = setCookies
        .find((c: string) => c.startsWith("customer_oauth_consent="))
        ?.match(/customer_oauth_consent=([^;]+)/)?.[1];

      const res = await request(app)
        .post("/api/v1/auth/customer/social/accept-terms")
        .set("Cookie", `customer_oauth_consent=${consent}`)
        .send({ acceptedTerms: true, role: "SUPER_ADMIN" });
      expect(res.status).toBe(201);
      expect(await UserModel.countDocuments()).toBe(0);
      const account = await CustomerAccountModel.findOne({ email: "consent4@test.com" })
        .lean()
        .exec();
      expect(account).toBeTruthy();
      expect(account).not.toHaveProperty("role");
    });
  });
});
