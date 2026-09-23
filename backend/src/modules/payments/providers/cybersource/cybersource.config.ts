import { CYBERSOURCE_API_HOSTS, CYBERSOURCE_JWKS_HOSTS } from "./cybersource-types.js";
import { logger } from "../../../../utils/logger.js";
/**
 * Centralised Cybersource configuration.
 *
 * SECURITY: everything here is server-only. None of these values may ever be
 * sent to the browser or exposed through a `NEXT_PUBLIC_*`/`VITE_*` variable.
 * The values come from the Cybersource Business Center (Payment Configuration
 * → Key Management, "HTTP Signature" key). The Business Center dashboard
 * username/password must never be used as an application credential.
 *
 * The module reads raw process.env at call time so the values stay
 * overridable in tests; the Zod schema in `config/env.ts` still validates the
 * full set (and fails fast) at application startup, and {@link validate}
 * re-checks required credentials before every outbound request.
 */
const PLACEHOLDER = "replace-me";

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function get(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}
function markRequiredMissing(name: string, missing: string[]): void {
  const value = get(name);
  if (!value || value.toLowerCase() === PLACEHOLDER) {
    missing.push(name);
  }
}
export const cybersourceConfig = {
  environment(): "test" | "production" {
    return get("CYBERSOURCE_ENVIRONMENT") === "production" ? "production" : "test";
  },
  /** REST API base URL for the configured environment. */
  apiBaseUrl(): string {
    return CYBERSOURCE_API_HOSTS[this.environment()];
  },
  /** Host that serves the public keys used to verify Cybersource-signed JWTs. */
  jwksHost(): string {
    return CYBERSOURCE_JWKS_HOSTS[this.environment()];
  },
  merchantId(): string {
    return get("CYBERSOURCE_MERCHANT_ID") ?? "";
  },
  keyId(): string {
    return get("CYBERSOURCE_KEY_ID") ?? "";
  },
  sharedSecret(): string {
    return get("CYBERSOURCE_SHARED_SECRET") ?? "";
  },
  /** Optional portfolio / organization id (multi-org merchant configurations). */
  organizationId(): string | undefined {
    return get("CYBERSOURCE_ORGANIZATION_ID") || undefined;
  },
  currency(): string {
    return (get("CYBERSOURCE_CURRENCY") ?? "USD").toUpperCase();
  },
  locale(): string {
    return get("CYBERSOURCE_LOCALE") ?? "en_US";
  },
  country(): string {
    return (get("CYBERSOURCE_COUNTRY") ?? "US").toUpperCase();
  },
  /** Card networks to offer — configure ONLY what the merchant bank supports. */
  allowedCardNetworks(): string[] {
    return parseCsv(get("CYBERSOURCE_ALLOWED_CARD_NETWORKS"));
  },
  /** Payment types (e.g. CARD; extendable to GOOGLEPAY, APPLEPAY, CLICKTOPAY…). */
  allowedPaymentTypes(): string[] {
    return parseCsv(get("CYBERSOURCE_ALLOWED_PAYMENT_TYPES"));
  },
  clientVersion(): string {
    // "1.0" is the value the current Unified Checkout sessions API accepts
    // (the legacy "0.26" is rejected: "Invalid clientVersion").
    return get("CYBERSOURCE_CLIENT_VERSION") ?? "1.0";
  },
  requestTimeoutMs(): number {
    const value = Number(get("CYBERSOURCE_REQUEST_TIMEOUT_MS") ?? "15000");
    return Number.isFinite(value) && value > 0 ? value : 15_000;
  },
  completeMandateEnabled(): boolean {
    return (get("CYBERSOURCE_COMPLETE_MANDATE_ENABLED") ?? "true") === "true";
  },
  /**
   * Browser origins allowed to render Unified Checkout. Uses the explicit
   * CYBERSOURCE_TARGET_ORIGINS override when set (Unified Checkout REQUIRES
   * HTTPS origins, so a local HTTP dev origin can be overridden here),
   * otherwise derived from the existing CORS origin configuration
   * (comma-separated, trailing slashes stripped) so the allowlist always
   * matches the deployed storefronts.
   *
   * LIVE-VERIFIED (Phase 20): the sessions API rejects ANY non-HTTPS origin
   * with HTTP 400 FORMAT ("Origin must use HTTPS protocol, found: http").
   * HTTP origins are valid for CORS but invalid for targetOrigins, so they
   * are dropped here (with a warning) — the request then carries only
   * origins Cybersource accepts. The production boot check in config/env.ts
   * already fails fast when insecure origins are configured in production.
   */
  targetOrigins(): string[] {
    const override = get("CYBERSOURCE_TARGET_ORIGINS");
    const raw = (override ?? get("CLIENT_ORIGIN") ?? "http://localhost:8080")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    const httpsOnly = raw.filter((origin) => origin.startsWith("https://"));
    if (httpsOnly.length !== raw.length) {
      logger.warn(
        {
          dropped: raw.length - httpsOnly.length,
          remaining: httpsOnly.length,
        },
        "Cybersource target origins: dropped non-HTTPS origins (the sessions API requires HTTPS)",
      );
    }
    return httpsOnly;
  },
  /** Fails fast with an explicit, non-leaking error when credentials are missing. */
  validate(): void {
    const missing: string[] = [];
    markRequiredMissing("CYBERSOURCE_MERCHANT_ID", missing);
    markRequiredMissing("CYBERSOURCE_KEY_ID", missing);
    markRequiredMissing("CYBERSOURCE_SHARED_SECRET", missing);
    if (missing.length > 0) {
      throw new Error(
        `Cybersource credentials are not configured (missing or placeholder: ${missing.join(", ")}). ` +
          "Set them in the environment from the Cybersource Business Center HTTP Signature key.",
      );
    }
  },
  /**
   * True when the three required credentials are present (and not the
   * placeholder) — used by the provider registry to register the gateway
   * only when it is actually usable, mirroring Fonepay's behaviour.
   */
  isConfigured(): boolean {
    const missing: string[] = [];
    markRequiredMissing("CYBERSOURCE_MERCHANT_ID", missing);
    markRequiredMissing("CYBERSOURCE_KEY_ID", missing);
    markRequiredMissing("CYBERSOURCE_SHARED_SECRET", missing);
    return missing.length === 0;
  },
};

/** Registry-facing convenience wrapper. */
export function isCybersourceConfigured(): boolean {
  return cybersourceConfig.isConfigured();
}
