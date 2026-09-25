/**
 * Fonepay configuration validation rules (pure + dependency-free).
 *
 * WHY A SEPARATE MODULE: `config/env.ts` must fail fast on a misconfigured
 * Fonepay gateway, but `config/env.ts` sits at the bottom of the import graph.
 * This module therefore imports NOTHING (`env.ts`, logger, fetch — none), so
 * `config/env.ts` can import it without creating a cycle, and the rules can be
 * unit-tested directly with synthetic inputs (see
 * `test/fonepay-configuration.test.ts`).
 *
 * WHAT IS VALIDATED (and why):
 * - Fonepay is an ONLINE, live-money API. Both the UAT and the production hosts
 *   are HTTPS, so a non-HTTPS base URL is always a misconfiguration — never a
 *   "development convenience". Rejected in EVERY environment.
 * - The gateway environment must be stated EXPLICITLY (mirroring
 *   `CYBERSOURCE_ENVIRONMENT`). Without it, production could silently route live
 *   merchant credentials at the UAT host, and a production-declared
 *   configuration could silently point at a sandbox host. Both directions are
 *   rejected.
 * - A credential set that is only partially present is rejected: it would
 *   register no provider yet still look intentional.
 *
 * WHAT IS NOT VALIDATED HERE: the RSA private key material. That check needs
 * `node:crypto` and lives in `fonepay.signature.ts`
 * (`normalizeFonepayPrivateKey`), which `config/env.ts` also calls.
 */

/** Fonepay gateway environments this integration supports. */
export type FonepayEnvironment = "uat" | "production";

/**
 * Host fragments that prove a URL points at a NON-production endpoint
 * (Fonepay UAT/dev hosts, or a sandbox/staging stand-in). Matched per DNS
 * label so e.g. `uat-new-merchant-api.fonepay.com` and `dev-gateway.example`
 * match while `merchantapi.fonepay.com` does not.
 */
const NON_PRODUCTION_HOST_PATTERN = /(^|[.-])(uat|dev|sandbox|test|stg|staging)([.-]|$)/i;

/** True when `value` is an absolute, well-formed `https://` URL. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** True when `value` is a URL whose host is a known non-production endpoint. */
export function isNonProductionUrl(value: string): boolean {
  try {
    return NON_PRODUCTION_HOST_PATTERN.test(new URL(value).host);
  } catch {
    return false;
  }
}

export interface FonepayConfigInput {
  /** `FONEPAY_ENABLED` — the explicit enable/disable flag. */
  enabled: boolean;
  /** `FONEPAY_ENVIRONMENT` — `"uat" | "production"`, or `""` when unset. */
  environment: string;
  baseUrl: string;
  username: string;
  password: string;
  terminalId: string;
  privateKey: string;
}

/** The five values that must be present together for Fonepay to be usable. */
export function missingFonepayCredentials(input: FonepayConfigInput): string[] {
  const required: ReadonlyArray<readonly [string, string]> = [
    ["FONEPAY_BASE_URL", input.baseUrl],
    ["FONEPAY_USERNAME", input.username],
    ["FONEPAY_PASSWORD", input.password],
    ["FONEPAY_PRIVATE_KEY", input.privateKey],
    ["FONEPAY_TERMINAL_ID", input.terminalId],
  ];
  return required.filter(([, value]) => value.length === 0).map(([name]) => name);
}

/**
 * Returns every reason the configured Fonepay gateway would be unsafe or
 * unusable. An EMPTY array means "nothing to complain about" — which includes
 * the (default) disabled state, where no credential is read at all.
 */
export function fonepayConfigProblems(input: FonepayConfigInput): string[] {
  const problems: string[] = [];
  const missing = missingFonepayCredentials(input);

  // Partial configuration is never intentional: either enable Fonepay with the
  // complete credential set, or leave all of it unset.
  if (missing.length > 0 && missing.length < 5) {
    problems.push(
      `Fonepay is only partially configured: ${missing.join(", ")} missing. Set all of FONEPAY_BASE_URL, FONEPAY_USERNAME, FONEPAY_PASSWORD, FONEPAY_PRIVATE_KEY and FONEPAY_TERMINAL_ID together (or omit all of them).`,
    );
  }

  if (input.enabled && missing.length > 0) {
    problems.push(
      `FONEPAY_ENABLED=true requires every Fonepay credential: ${missing.join(", ")} missing.`,
    );
  }

  // Only judge URL/environment consistency once there is something to connect to.
  if (input.baseUrl.length > 0) {
    if (!isHttpsUrl(input.baseUrl)) {
      problems.push(
        "FONEPAY_BASE_URL must be an absolute https:// URL (Fonepay exposes no plaintext HTTP endpoint).",
      );
    }
    if (input.enabled && input.environment.length === 0) {
      problems.push(
        'FONEPAY_ENVIRONMENT must be set explicitly to "uat" or "production" when Fonepay is enabled (an unset value could route live payments at the UAT host).',
      );
    }
    if (input.environment === "production" && isNonProductionUrl(input.baseUrl)) {
      problems.push(
        "FONEPAY_ENVIRONMENT=production must not point FONEPAY_BASE_URL at a UAT/dev/sandbox host.",
      );
    }
  }

  return problems;
}
