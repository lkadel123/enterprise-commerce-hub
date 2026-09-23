import { createPublicKey, type JsonWebKey } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";

import { env } from "../../../config/env.js";
import { badRequest } from "../../../utils/ApiError.js";
import { logger } from "../../../utils/logger.js";
import type { SocialProvider } from "../customerSocialAccount.model.js";
import {
  OAuthProviderError,
  UnverifiedEmailError,
  formBody,
  oauthFetchJson,
  optionalString,
} from "./oauth-shared.js";

/**
 * Google OAuth 2.0 / OpenID Connect client (Authorization Code flow).
 *
 * Identity is verified SERVER-SIDE exactly per Google's OIDC mechanism:
 * the ID token returned by the token endpoint is verified against Google's
 * published JWKS (RS256 signature), with strict `iss`/`aud`/`exp` checks and
 * `email_verified` enforcement. Profile data sent by the browser is NEVER
 * trusted — only the provider-verified token exchange result.
 *
 * Docs: https://developers.google.com/identity/openid-connect/openid-connect
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";

const MS_PER_MINUTE = 60_000;
const JWKS_CACHE_TTL = 60 * MS_PER_MINUTE;

export interface GoogleProfile {
  provider: SocialProvider;
  providerUserId: string;
  email: string;
  /** True only when Google guarantees the email is verified. */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export function isGoogleConfigured(): boolean {
  return env.GOOGLE_CLIENT_ID !== "" && env.GOOGLE_CLIENT_SECRET !== "";
}

/** Absolute redirect URI registered in the Google Cloud console. */
export function googleRedirectUri(): string {
  return (
    env.GOOGLE_REDIRECT_URI ?? `${env.BACKEND_PUBLIC_URL}/api/v1/auth/customer/google/callback`
  );
}

/** Builds the consent-screen URL (the `state` value is minted by the controller). */
export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Online-only access: the app never receives a Google access/refresh token
    // to retain, and no offline scope is requested.
    access_type: "online",
    include_granted_scopes: "true",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface CachedJwks {
  keys: JsonWebKey[];
  cachedAt: number;
}

let jwksCache: CachedJwks | null = null;

async function fetchJwks(): Promise<CachedJwks> {
  const body = await oauthFetchJson(JWKS_URL);
  const keys = body.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new OAuthProviderError("Google JWKS is empty");
  }
  const rsaKeys = keys.filter(
    (key): key is JsonWebKey => typeof key === "object" && key !== null && !Array.isArray(key),
  );
  if (rsaKeys.length === 0) {
    throw new OAuthProviderError("Google JWKS has no signing keys");
  }
  return { keys: rsaKeys, cachedAt: Date.now() };
}

async function getSigningKey(kid: string | undefined): Promise<JsonWebKey> {
  let cache = jwksCache;
  // Cache miss or expired cache → refresh once.
  if (!cache || Date.now() - cache.cachedAt > JWKS_CACHE_TTL) {
    cache = await fetchJwks();
    jwksCache = cache;
  }
  const key = cache.keys.find((k) => k.kid === kid && k.kty === "RSA");
  if (key) return key;
  // Unknown kid → key rotation happened; refresh the JWKS once and retry.
  logger.info("Google JWKS cache miss — refreshing signing keys");
  const fresh = await fetchJwks();
  jwksCache = fresh;
  const retryKey = fresh.keys.find((k) => k.kid === kid && k.kty === "RSA");
  if (!retryKey) throw new OAuthProviderError("Unknown Google signing key");
  return retryKey;
}

/** Verifies a Google ID token (signature/issuer/audience/expiry) and returns the verified profile. */
async function verifyIdToken(idToken: string): Promise<GoogleProfile> {
  let kid: string | undefined;
  try {
    const decoded = jwt.decode(idToken, { complete: true });
    if (decoded && typeof decoded !== "string") {
      kid = typeof decoded.header.kid === "string" ? decoded.header.kid : undefined;
    }
  } catch {
    kid = undefined;
  }

  const jwk = await getSigningKey(kid);
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });

  let payload: JwtPayload;
  try {
    const verified = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      audience: env.GOOGLE_CLIENT_ID,
      // Google's documented issuers (both forms appear in the wild).
      issuer: ["https://accounts.google.com", "accounts.google.com"] as [string, string],
      // `exp`/`nbf` are enforced by jsonwebtoken automatically.
    });
    if (typeof verified === "string") throw new OAuthProviderError("Unexpected Google ID token");
    payload = verified as JwtPayload;
  } catch {
    // Signature/issuer/audience/expiry failure — treat as an invalid token.
    throw badRequest("Google sign-in could not be verified.");
  }

  const providerUserId = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const emailVerified = payload.email_verified === true;
  if (!providerUserId || !email || !emailVerified) {
    // Google always returns sub; email can only be missing when the scope was
    // not granted or the email is unverified — refuse both with a dedicated
    // error so the storefront can guide the user without revealing whether an
    // account with that email exists.
    throw new UnverifiedEmailError("Google email is missing or not verified.");
  }

  return {
    provider: "google",
    providerUserId,
    email,
    emailVerified,
    name: optionalString(payload.name),
    avatarUrl: optionalString(payload.picture),
  };
}

/** Exchanges an authorization code for tokens and returns the VERIFIED profile. */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const body = await oauthFetchJson(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  const idToken = optionalString(body.id_token);
  if (!idToken) {
    throw new OAuthProviderError("Google token response did not include an ID token");
  }

  // The Google access token is intentionally discarded — this app only needs
  // the verified identity, never a retained provider token.
  return verifyIdToken(idToken);
}
