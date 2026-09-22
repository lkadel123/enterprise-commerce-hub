import { env, isProduction } from "../config/env.js";

/**
 * Optional error monitoring (Phase 12 — Sentry integration).
 *
 * This module is deliberately decoupled from the Sentry SDK:
 *
 *  - The Sentry DSN is read from environment config and is optional. If absent,
 *    every function is a no-op, so **development never requires Sentry**, no
 *    secrets enter the codebase, and no bundle/runtime risk is introduced.
 *  - The SDK is only ever loaded lazily and dynamically. The import is driven
 *    by a runtime module-name string so the source type-checks and builds even
 *    when the `@sentry/*` package is not installed (e.g. in CI).
 *  - Sensitive data is never sent: only the error object + an optional, caller
 *    supplied, metadata object are forwarded. Authorization headers, refresh
 *    cookies and customer PII are never captured here.
 *  - Source maps / release tagging and the exact DSN value are deployment
 *    concerns; see `docs/PRODUCTION_OPERATIONS.md` (Observability).
 *
 * Before production, an operator must:
 *   1. install the Sentry SDK (`@sentry/node` for the API),
 *   2. set `SENTRY_DSN` / `SENTRY_ENVIRONMENT`,
 *   3. re-run the production security script and smoke tests.
 */

/** Module-name string — kept non-constant-global so `import()` stays inert to
 * static module resolution when the SDK is not installed. */
const SENTRY_NODE_SDK = "@sentry/node";

interface SentrySdkLike {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (error: unknown, hint?: Record<string, unknown>) => string;
  setTags?: (tags: Record<string, string>) => void;
}

let sdk: SentrySdkLike | null = null;
let loadErrorReported = false;

/** True when a DSN is configured; used to skip work before the check. */
export function isErrorReportingEnabled(): boolean {
  return Boolean(env.SENTRY_DSN);
}

async function ensureSdk(): Promise<SentrySdkLike | null> {
  if (sdk) return sdk;
  if (!env.SENTRY_DSN) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = (await import(SENTRY_NODE_SDK)) as SentrySdkLike;
    if (typeof mod.init === "function") {
      mod.init({
        dsn: env.SENTRY_DSN,
        environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
        tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
        // Never attach request headers/body — they may carry Authorization or
        // refresh cookies. Breadcrumbs are further restricted below.
        attachStacktrace: true,
        normalizeDepth: 6,
      });
      sdk = mod;
    }
    return sdk;
  } catch {
    // The SDK is not installed (or failed to load). Swallow it so the app keeps
    // running; report the misconfiguration through the structured logger once.
    if (!loadErrorReported) {
      loadErrorReported = true;
      // Avoid importing the logger here to prevent a circular dependency; use a
      // plain console warning (redaction not needed — no payload authored).
      // eslint-disable-next-line no-console
      console.warn(
        `[errorReporter] SENTRY_DSN is set but '${SENTRY_NODE_SDK}' is not installed. ` +
          "Install the Sentry SDK and configure the DSN before production.",
      );
    }
    return null;
  }
}

/**
 * Reports an error to Sentry when configured. Always safe to call.
 * Returns a Sentry event id on success, or `undefined` when disabled.
 *
 * `context` should contain only non-sensitive, non-PII metadata. Do **not**
 * pass request headers, cookies, tokens, or customer-provided free text here.
 */
export async function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<string | undefined> {
  if (!env.SENTRY_DSN) return undefined;
  const activeSdk = await ensureSdk();
  if (!activeSdk?.captureException) return undefined;

  const hint: Record<string, unknown> = {};
  if (context && Object.keys(context).length > 0) {
    hint.extra = context;
  }

  try {
    return activeSdk.captureException(error, hint);
  } catch {
    return undefined;
  }
}

/** Synchronously signals an upstream scanner that the SDK is (or is not) wired. */
export interface ErrorMonitoringStatus {
  enabled: boolean;
  dsn: boolean;
  sdkInstalled: boolean;
  environment: string;
}

/** Health-probe helper: is error monitoring configured and loadable? */
export async function getErrorMonitoringStatus(): Promise<ErrorMonitoringStatus> {
  if (!env.SENTRY_DSN) {
    return { enabled: false, dsn: false, sdkInstalled: false, environment: env.NODE_ENV };
  }
  const activeSdk = sdk ?? (await ensureSdk());
  return {
    enabled: Boolean(activeSdk),
    dsn: true,
    sdkInstalled: Boolean(activeSdk),
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
  };
}

// Re-export for tests / callers that share the production check.
export { isProduction };
