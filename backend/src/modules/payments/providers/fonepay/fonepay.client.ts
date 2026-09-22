import { env } from "../../../../config/env.js";
import { logger } from "../../../../utils/logger.js";
import {
  fonepayBaseUrl,
  fonepayTerminalId,
  fonepayTimeoutMs,
  isFonepayConfigured,
} from "./fonepay.config.js";
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
    | "provider";

  constructor(httpStatus: number, kind: FonepayApiError["kind"], message: string) {
    super(message);
    this.name = "FonepayApiError";
    this.httpStatus = httpStatus;
    this.kind = kind;
  }
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
    return new FonepayApiError(400, "validation", providerMessage || "Fonepay rejected the request.");
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
  const signature = signFonepayPayload(
    normalizeFonepayPrivateKey(env.FONEPAY_PRIVATE_KEY),
    body,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fonepayTimeoutMs());
  const startedAt = Date.now();
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
    logger.info(
      { provider: "FONEPAY", path: options.path, httpStatus: response.status, latencyMs },
      "Fonepay API call",
    );

    if (!response.ok) {
      throw await fonepayErrorFromResponse(response, options.path);
    }
    const data: unknown = await response.json();
    return options.validate(data);
  } catch (error) {
    if (error instanceof FonepayApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new FonepayApiError(504, "timeout", `Fonepay request timed out: ${options.path}`);
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
    validate: (raw) => fonepayLoginResponseSchema.parse(raw),
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
    return fonepayBankListResponseSchema.parse(await response.json());
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

/** POST /api/merchant/third-party/v2/generate-intent-qr */
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
    validate: (raw) => fonepayIntentQrResponseSchema.parse(raw),
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
    validate: (raw) => fonepayStatusResponseSchema.parse(raw),
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
