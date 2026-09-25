import { ZodError, type ZodType } from "zod";

import { env } from "../../../../config/env.js";
import { logger } from "../../../../utils/logger.js";
import {
  fonepayBaseUrl,
  fonepayTerminalId,
  fonepayTimeoutMs,
  isFonepayConfigured,
} from "./fonepay.config.js";
import {
  describeFonepayApplicationFailure,
  summarizeFonepayIssues,
  summarizeFonepayPayload,
  type FonepayResponseDiagnostics,
} from "./fonepay.diagnostics.js";
import {
  fonepayBasicAuth,
  normalizeFonepayPrivateKey,
  signFonepayPayload,
} from "./fonepay.signature.js";
import {
  fonepayBankListResponseSchema,
  fonepayIntentQrRequestSchema,
  fonepayIntentQrResponseSchema,
  fonepayLoginResponseSchema,
  fonepayStatusRequestSchema,
  fonepayStatusResponseSchema,
  type FonepayBankListResponse,
  type FonepayIntentQrRequest,
  type FonepayIntentQrResponse,
  type FonepayLoginResponse,
  type FonepayStatusRequest,
  type FonepayStatusResponse,
} from "./fonepay.types.js";

/**
 * Server-side Fonepay HTTP client (never used from the browser).
 *
 * Request construction — the documented critical rule:
 *   the request JSON body is serialized EXACTLY ONCE, that exact string is
 *   signed (SHA256withRSA) and the SAME string is sent as the body. Nothing is
 *   ever re-serialized or reordered after signing.
 *
 * SECURITY:
 * - credentials and the private key live only in this module and the signature
 *   helper; nothing here returns or logs them;
 * - access tokens are cached in-process and never logged;
 * - only safe diagnostics (method, path, HTTP status, latency) are logged.
 */

const THIRD_PARTY_BASE_PATH = "/api/merchant/third-party/v2";
const LOGIN_PATH = "/api/merchant/merchantDetailsForThirdParty/v2/login";

/** Shown to callers when a Fonepay body does not match its documented contract. */
const FONEPAY_INVALID_RESPONSE_MESSAGE =
  "Fonepay returned a response that does not match the documented contract.";

/** Provider-level error with the Fonepay HTTP status and a safe message. */
export class FonepayApiError extends Error {
  public readonly httpStatus: number;
  public readonly kind:
    | "not_configured"
    | "network"
    | "timeout"
    | "auth"
    | "validation"
    | "duplicate_reference"
    | "terminal_not_found"
    | "invalid_response"
    | "provider";

  /**
   * Redaction-safe diagnostics for a rejected response body: issue paths,
   * expected/received TYPES and provider field NAMES only (see
   * `fonepay.diagnostics.ts`). Safe to log verbatim — it never contains a
   * provider value, the QR payload, a token or signing material.
   */
  public readonly diagnostics?: FonepayResponseDiagnostics;

  constructor(
    httpStatus: number,
    kind: FonepayApiError["kind"],
    message: string,
    diagnostics?: FonepayResponseDiagnostics,
  ) {
    super(message);
    this.name = "FonepayApiError";
    this.httpStatus = httpStatus;
    this.kind = kind;
    this.diagnostics = diagnostics;
  }
}

/**
 * Validate a provider body against its documented schema, failing CLOSED.
 *
 * Unlike a bare `schema.parse()`, a violation is converted into a typed
 * `invalid_response` error that CARRIES redaction-safe diagnostics, so the log
 * can state which field was wrong and which types were expected/received. The
 * raw `ZodError` (whose `message` can embed received values, and which the
 * blanket request catch would have downgraded to a misleading 502 "network")
 * never escapes this module.
 */
function parseFonepayResponse<T>(schema: ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new FonepayApiError(502, "invalid_response", FONEPAY_INVALID_RESPONSE_MESSAGE, {
    responseShape: summarizeFonepayPayload(raw),
    issues: summarizeFonepayIssues(parsed.error),
  });
}

/** Ensure the module is usable — fail fast with a typed error when unconfigured. */
function assertConfigured(): void {
  if (!isFonepayConfigured()) {
    throw new FonepayApiError(503, "not_configured", "Fonepay is not configured.");
  }
}

/** Build the absolute URL for a Fonepay path (base URL comes from env only). */
function fonepayUrl(path: string): string {
  return `${fonepayBaseUrl()}${path}`;
}

/** Convert a non-2xx Fonepay response into a typed, credential-free error. */
async function fonepayErrorFromResponse(
  response: Response,
  path: string,
): Promise<FonepayApiError> {
  let providerMessage = "";
  try {
    const data = (await response.json()) as { message?: unknown };
    if (typeof data?.message === "string") providerMessage = data.message;
  } catch {
    /* body was not JSON — keep the generic message */
  }

  if (response.status === 400) {
    return new FonepayApiError(
      400,
      "validation",
      providerMessage || "Fonepay rejected the request.",
    );
  }
  if (response.status === 401) {
    return new FonepayApiError(401, "auth", "Fonepay authentication failed.");
  }
  if (response.status === 409) {
    if (/duplicate reference/i.test(providerMessage)) {
      return new FonepayApiError(409, "duplicate_reference", "Duplicate reference label.");
    }
    if (/terminal/i.test(providerMessage)) {
      return new FonepayApiError(409, "terminal_not_found", "Fonepay terminal not found.");
    }
    return new FonepayApiError(409, "provider", providerMessage || "Fonepay conflict.");
  }
  return new FonepayApiError(
    response.status,
    "provider",
    providerMessage || `Fonepay request failed: ${path}`,
  );
}

/** POST JSON with the documented signature header over the exact body string. */
async function fonepaySignedRequest<T>(options: {
  path: string;
  payload: unknown;
  authHeader: string;
  validate: (data: unknown) => T;
}): Promise<T> {
  assertConfigured();
  const body = JSON.stringify(options.payload); // serialized exactly once
  const signature = signFonepayPayload(normalizeFonepayPrivateKey(env.FONEPAY_PRIVATE_KEY), body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fonepayTimeoutMs());
  const startedAt = Date.now();
  // Tracked for SAFE failure diagnostics only: the HTTP status and the parsed
  // body (never logged itself — only summarized as names/types by
  // `fonepay.diagnostics.ts`).
  let httpStatus: number | null = null;
  let rawPayload: unknown;
  try {
    const response = await fetch(fonepayUrl(options.path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        signature,
        Authorization: options.authHeader,
      },
      body,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    httpStatus = response.status;
    logger.info(
      { provider: "FONEPAY", path: options.path, httpStatus: response.status, latencyMs },
      "Fonepay API call",
    );

    if (!response.ok) {
      throw await fonepayErrorFromResponse(response, options.path);
    }
    rawPayload = await response.json();
    return options.validate(rawPayload);
  } catch (error) {
    if (error instanceof FonepayApiError) {
      // A body rejected by contract validation (or an application-level failure
      // delivered with HTTP 200): `diagnostics` is redaction-safe by
      // construction — field NAMES, issue paths, expected/received TYPES — and
      // is the only way to diagnose a provider-side response change without
      // capturing payment payloads.
      if (error.diagnostics) {
        logger.error(
          {
            provider: "FONEPAY",
            path: options.path,
            httpStatus,
            kind: error.kind,
            ...error.diagnostics,
          },
          "Fonepay API response rejected",
        );
      }
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new FonepayApiError(504, "timeout", `Fonepay request timed out: ${options.path}`);
    }
    // A 2xx body that is not JSON is a contract violation, not a transport
    // failure: classifying it as "network" hid the real cause from operators.
    if (error instanceof SyntaxError) {
      logger.error(
        { provider: "FONEPAY", path: options.path, httpStatus, errorType: "SyntaxError" },
        "Fonepay API response rejected",
      );
      throw new FonepayApiError(502, "invalid_response", FONEPAY_INVALID_RESPONSE_MESSAGE);
    }
    // Any remaining raw `ZodError` (a validator that still throws it directly):
    // summarize safely instead of leaking provider internals or reporting it as
    // a network failure.
    if (error instanceof ZodError) {
      const diagnostics: FonepayResponseDiagnostics = {
        responseShape: summarizeFonepayPayload(rawPayload),
        issues: summarizeFonepayIssues(error),
      };
      logger.error(
        {
          provider: "FONEPAY",
          path: options.path,
          httpStatus,
          errorType: "ZodError",
          ...diagnostics,
        },
        "Fonepay API response rejected",
      );
      throw new FonepayApiError(
        502,
        "invalid_response",
        FONEPAY_INVALID_RESPONSE_MESSAGE,
        diagnostics,
      );
    }
    logger.error(
      { provider: "FONEPAY", path: options.path, errorType: (error as Error)?.name },
      "Fonepay API request failed",
    );
    throw new FonepayApiError(502, "network", "Fonepay request failed.");
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ Token cache ------------------------------- */

const TOKEN_EXPIRY_MARGIN_MS = 60_000;

interface CachedToken {
  /** Raw JWT (no "Bearer " prefix) — the prefix is added per-request. */
  accessToken: string;
  /** Epoch ms after which the token is treated as expired. */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let loginInFlight: Promise<string> | null = null;

/**
 * OAuth login (documented endpoint). The login body itself is signed and sent
 * with `Authorization: Basic base64(username:password)`.
 */
async function login(): Promise<string> {
  assertConfigured();
  const payload = { username: env.FONEPAY_USERNAME, password: env.FONEPAY_PASSWORD };
  const data = await fonepaySignedRequest<FonepayLoginResponse>({
    path: LOGIN_PATH,
    payload,
    authHeader: fonepayBasicAuth(env.FONEPAY_USERNAME, env.FONEPAY_PASSWORD),
    validate: (raw) => parseFonepayResponse(fonepayLoginResponseSchema, raw),
  });
  if (!data.accessToken) {
    throw new FonepayApiError(502, "provider", "Fonepay login returned no access token.");
  }
  const expiresInMs = (data.expiresIn ?? 3600) * 1000;
  cachedToken = {
    accessToken: data.accessToken,
    expiresAt: Date.now() + expiresInMs - TOKEN_EXPIRY_MARGIN_MS,
  };
  return data.accessToken;
}

/**
 * Bearer token accessor with in-process caching and single-flight re-login.
 * Builds the documented `Authorization: Bearer <JWT_TOKEN>` header value.
 */
export async function getFonepayAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }
  if (!loginInFlight) {
    loginInFlight = login()
      .catch((error) => {
        cachedToken = null;
        throw error;
      })
      .finally(() => {
        loginInFlight = null;
      });
  }
  return loginInFlight;
}

/** `Authorization` header value — tolerates an accessToken that already carries "Bearer ". */
function bearerHeader(token: string): string {
  return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
}

/* ------------------------------- Public API ------------------------------- */

/**
 * GET /api/merchant/third-party/v2/banks/list
 * `signature` is OPTIONAL for this GET (no body to sign) per the API document;
 * `paymentMode: INTENT` selects the intent flow.
 */
export async function getFonepayBankList(mobileNo?: string): Promise<FonepayBankListResponse> {
  assertConfigured();
  const token = await getFonepayAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fonepayTimeoutMs());
  const startedAt = Date.now();
  try {
    const response = await fetch(fonepayUrl(`${THIRD_PARTY_BASE_PATH}/banks/list`), {
      method: "GET",
      headers: {
        paymentMode: "INTENT",
        Authorization: bearerHeader(token),
        ...(mobileNo ? { mobileNo } : {}),
      },
      signal: controller.signal,
    });
    logger.info(
      {
        provider: "FONEPAY",
        path: "/banks/list",
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
      },
      "Fonepay API call",
    );
    if (!response.ok) {
      throw await fonepayErrorFromResponse(response, "/banks/list");
    }
    return parseFonepayResponse(fonepayBankListResponseSchema, await response.json());
  } catch (error) {
    if (error instanceof FonepayApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FonepayApiError(504, "timeout", "Fonepay bank list request timed out.");
    }
    throw new FonepayApiError(502, "network", "Fonepay bank list request failed.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /api/merchant/third-party/v2/generate-intent-qr
 *
 * Response handling (the production failure this guards against): Fonepay can
 * answer HTTP 200 with an application-level failure (`message`/`error`/
 * `qrMessage`, no `qrString`). Such a body is reported as a PROVIDER error with
 * the provider's reason, instead of surfacing as an opaque schema violation;
 * anything else that lacks the documented `qrString` payload fails closed with
 * redaction-safe diagnostics.
 */
export async function generateFonepayIntentQr(
  payload: FonepayIntentQrRequest,
): Promise<FonepayIntentQrResponse> {
  // Shape validation BEFORE signing — the exact validated payload is signed.
  const body = fonepayIntentQrRequestSchema.parse(payload);
  const token = await getFonepayAccessToken();
  return fonepaySignedRequest<FonepayIntentQrResponse>({
    path: `${THIRD_PARTY_BASE_PATH}/generate-intent-qr`,
    payload: body,
    authHeader: bearerHeader(token),
    validate: (raw) => {
      // HTTP 200 + application-level failure: never a success, and never a
      // schema violation either — the provider's own reason is what an operator
      // needs to see.
      const providerFailure = describeFonepayApplicationFailure(raw);
      if (providerFailure) {
        throw new FonepayApiError(502, "provider", providerFailure, {
          responseShape: summarizeFonepayPayload(raw),
        });
      }
      return parseFonepayResponse(fonepayIntentQrResponseSchema, raw);
    },
  });
}

/** POST /api/merchant/third-party/v2/thirdPartyDynamicQrGetStatus */
export async function getFonepayPaymentStatus(
  payload: FonepayStatusRequest,
): Promise<FonepayStatusResponse> {
  const body = fonepayStatusRequestSchema.parse(payload);
  const token = await getFonepayAccessToken();
  return fonepaySignedRequest<FonepayStatusResponse>({
    path: `${THIRD_PARTY_BASE_PATH}/thirdPartyDynamicQrGetStatus`,
    payload: body,
    authHeader: bearerHeader(token),
    validate: (raw) => parseFonepayResponse(fonepayStatusResponseSchema, raw),
  });
}

/** The configured terminal id (also used for status-response verification). */
export function configuredFonepayTerminalId(): string {
  return fonepayTerminalId();
}

/** Test helper — drops the cached token so a fresh login is required. */
export function resetFonepayTokenForTests(): void {
  cachedToken = null;
  loginInFlight = null;
}
