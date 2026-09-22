import { env } from "../../../config/env.js";
import { badRequest } from "../../../utils/ApiError.js";
import type { SocialProvider } from "../customerSocialAccount.model.js";
import { OAuthProviderError, formBody, oauthFetchJson, optionalString } from "./oauth-shared.js";

/**
 * Facebook Login client (official OAuth flow, server-side verification).
 *
 * The authorization code is exchanged for a user access token; the token is
 * then verified with Facebook's `debug_token` endpoint (is_valid, app_id,
 * expiry, user_id) before any identity is accepted. Profile data sent by the
 * browser is NEVER trusted.
 *
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 */

const GRAPH_VERSION = "v21.0";
const AUTH_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const DEBUG_TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token`;
const ME_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me`;

export interface FacebookProfile {
  provider: SocialProvider;
  providerUserId: string;
  /** May be null — Facebook does not always return an email. */
  email: string | null;
  /** True only when Facebook returned an email (it only returns verified ones). */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export function isFacebookConfigured(): boolean {
  return env.FACEBOOK_APP_ID !== "" && env.FACEBOOK_APP_SECRET !== "";
}

/** App access token (`app_id|app_secret`) — server-side only, never sent to clients. */
function appAccessToken(): string {
  return `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
}

/** Absolute redirect URI registered in the Meta developer console. */
export function facebookRedirectUri(): string {
  return env.FACEBOOK_REDIRECT_URI ?? `${env.BACKEND_PUBLIC_URL}/api/v1/auth/customer/facebook/callback`;
}

/** Builds the consent-screen URL (the `state` value is minted by the controller). */
export function facebookAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: facebookRedirectUri(),
    response_type: "code",
    scope: "email,public_profile",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchanges an authorization code for a short-lived user access token. */
async function exchangeCode(code: string): Promise<string> {
  const body = await oauthFetchJson(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      code,
      client_id: env.FACEBOOK_APP_ID,
      client_secret: env.FACEBOOK_APP_SECRET,
      redirect_uri: facebookRedirectUri(),
    }),
  });

  const accessToken = optionalString(body.access_token);
  if (!accessToken) {
    throw new OAuthProviderError("Facebook token response did not include an access token");
  }
  return accessToken;
}

/**
 * Verifies the user access token against Facebook's debug_token endpoint.
 * Returns the token's user id (stable, and cross-checked against /me below).
 */
async function verifyUserToken(
  userToken: string,
): Promise<{ userToken: string; providerUserId: string }> {
  const params = new URLSearchParams({
    input_token: userToken,
    access_token: appAccessToken(),
  });
  const body = await oauthFetchJson(`${DEBUG_TOKEN_ENDPOINT}?${params.toString()}`);
  const data = body.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new OAuthProviderError("Facebook debug_token returned no data");
  }
  const tokenData = data as Record<string, unknown>;

  const isValid = tokenData.is_valid === true;
  const appId = optionalString(tokenData.app_id);
  const providerUserId = optionalString(tokenData.user_id);
  const expiresAt = typeof tokenData.expires_at === "number" ? tokenData.expires_at : 0;

  if (!isValid || appId !== env.FACEBOOK_APP_ID || !providerUserId) {
    // Token issued to a different app, expired, or invalid — refuse.
    throw badRequest("Facebook sign-in could not be verified.");
  }
  if (expiresAt > 0 && expiresAt * 1000 <= Date.now()) {
    throw badRequest("Facebook sign-in could not be verified.");
  }
  return { userToken, providerUserId };
}

/** Fetches the available profile fields for the verified Facebook identity. */
async function fetchFacebookMe(
  userToken: string,
  verifiedProviderUserId: string,
): Promise<FacebookProfile> {
  const params = new URLSearchParams({
    fields: "id,name,email,picture.type(large)",
    access_token: userToken,
  });
  const me = await oauthFetchJson(`${ME_ENDPOINT}?${params.toString()}`);

  const id = optionalString(me.id);
  if (!id || id !== verifiedProviderUserId) {
    // /me must agree with debug_token's user_id — otherwise the token and
    // profile do not belong to the same identity.
    throw new OAuthProviderError("Facebook profile identity mismatch");
  }

  const emailRaw = optionalString(me.email);
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  const picture = me.picture;
  let avatarUrl: string | null = null;
  if (picture && typeof picture === "object" && !Array.isArray(picture)) {
    const pictureData = (picture as Record<string, unknown>).data;
    if (pictureData && typeof pictureData === "object" && !Array.isArray(pictureData)) {
      avatarUrl = optionalString((pictureData as Record<string, unknown>).url);
    }
  }

  return {
    provider: "facebook",
    providerUserId: verifiedProviderUserId,
    email,
    emailVerified: email !== null,
    name: optionalString(me.name),
    avatarUrl,
  };
}

/** Exchanges an authorization code and returns the VERIFIED Facebook identity. */
export async function exchangeFacebookCode(code: string): Promise<FacebookProfile> {
  const userToken = await exchangeCode(code);
  const verified = await verifyUserToken(userToken);
  // The Facebook user access token is used only for these two server-side
  // calls and is never persisted, logged, or forwarded to any client.
  return fetchFacebookMe(verified.userToken, verified.providerUserId);
}
