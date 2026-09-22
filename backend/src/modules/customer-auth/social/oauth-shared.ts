import { serviceUnavailable } from "../../../utils/ApiError.js";
import { env } from "../../../config/env.js";
import { logger } from "../../../utils/logger.js";

/**
 * Shared OAuth plumbing for the social sign-in providers.
 *
 * SECURITY: every outbound call is server-side. Provider access tokens and
 * client secrets never leave the backend process, and failures are mapped to
 * a single safe "provider error" API error — raw provider responses (which may
 * contain tokens or infrastructure details) are only written to the server log.
 */

export class OAuthProviderError extends Error {}

/**
 * The provider could not verify the user's email (unverified or withheld).
 * Kept distinct from generic provider failures so the storefront can explain
 * accurately without leaking whether an account with that email exists.
 */
export class UnverifiedEmailError extends OAuthProviderError {
  constructor(message: string) {
    super(message);
    this.name = "UnverifiedEmailError";
  }
}

/** Minimal outbound fetch with timeout + safe error mapping. */
export async function oauthFetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.OAUTH_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      // Log the provider's raw failure server-side; never surface it.
      logger.warn({ url: redactUrl(url), status: response.status, body }, "OAuth provider request failed");
      throw new OAuthProviderError(`Provider request failed (${response.status})`);
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new OAuthProviderError("Provider returned an unexpected response");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OAuthProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn({ url: redactUrl(url) }, "OAuth provider request timed out");
      throw serviceUnavailable("The sign-in provider is unavailable. Please try again.");
    }
    // Network/Transport failures (DNS, TLS, offline) → safe 503.
    logger.warn({ err: error, url: redactUrl(url) }, "OAuth provider request error");
    throw serviceUnavailable("The sign-in provider is unavailable. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

/** Strip query strings (they can carry codes/secrets) before logging. */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

export function formBody(fields: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    params.set(name, value);
  }
  return params;
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
