import { logger } from "../../../../utils/logger.js";
import { cybersourceConfig } from "./cybersource.config.js";
import { httpSignatureHeaders } from "./cybersource-auth.js";

/**
 * Cybersource REST HTTP client.
 *
 * Centralises: request signing, timeouts, error mapping and SAFE logging.
 * Secrets, card data and full provider payloads are never logged — only
 * statuses, request ids and non-sensitive reasons.
 */

/** Per-field validation message returned in the Cybersource `errors[]` array. */
interface CybersourceErrorEntry {
  code?: unknown;
  message?: unknown;
  location?: unknown;
  reason?: unknown;
}

/** Subset of the Cybersource error response body that is safe to surface. */
interface CybersourceErrorBody {
  errorInformation?: { reason?: unknown } | undefined;
  errors?: CybersourceErrorEntry[] | undefined;
  /** Legacy/SCMP-style error body (`response.rmsg`). */
  response?: { rmsg?: unknown } | undefined;
}

export class CybersourceApiError extends Error {
  /** HTTP status from Cybersource, when the request reached the API. */
  readonly status?: number;
  /** Cybersource `Reason-Code` style reason, safe to expose internally. */
  readonly reason?: string;
  /** Cybersource machine error code (e.g. UNIFIEDPAYMENTS_VALIDATION_FIELDS). */
  readonly code?: string;
  /** Cybersource `v-c-correlation-id` for support/tracing (safe to log). */
  readonly requestId?: string;
  /** Per-field validation messages returned by the API (safe to log). */
  readonly messages?: string[];
  /** Whether the failure is transient (retryable with backoff). */
  readonly transient: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      reason?: string;
      code?: string;
      requestId?: string;
      messages?: string[];
      transient?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "CybersourceApiError";
    this.status = options.status;
    this.reason = options.reason;
    this.code = options.code;
    this.requestId = options.requestId;
    this.messages = options.messages;
    this.transient = options.transient ?? false;
  }
}

/**
 * Perform a signed Cybersource REST request.
 *
 * @param method - HTTP method ("POST" | "GET")
 * @param pathWithQuery - absolute path, e.g. "/uc/v1/sessions"
 * @param body - JSON-serializable request body (undefined for GET)
 * @returns the parsed JSON body, or the raw text when the body is not JSON
 *   (some Unified Checkout endpoints return the JWT as a raw string).
 */
export async function cybersourceRequest(
  method: "POST" | "GET",
  pathWithQuery: string,
  body?: unknown,
): Promise<unknown> {
  cybersourceConfig.validate();
  const rawBody = body === undefined ? undefined : JSON.stringify(body);
  const signed = httpSignatureHeaders(method, pathWithQuery, rawBody);
  const url = `${cybersourceConfig.apiBaseUrl()}${pathWithQuery}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cybersourceConfig.requestTimeoutMs());
  let response: Response;
  try {
    response = await fetch(url, {
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        // `host` is set automatically from the URL and must not be overridden.
        Date: signed.date,
        "v-c-merchant-id": signed["v-c-merchant-id"],
        ...(signed.Digest ? { Digest: signed.Digest } : {}),
        Signature: signed.Signature,
      },
      ...(rawBody !== undefined ? { body: rawBody } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    logger.error(
      { path: pathWithQuery, timeoutMs: cybersourceConfig.requestTimeoutMs(), aborted },
      "Cybersource request failed (network/timeout)",
    );
    throw new CybersourceApiError(
      aborted ? "Cybersource request timed out." : "Cybersource request failed.",
      { transient: true },
    );
  } finally {
    clearTimeout(timer);
  }

  const requestId = response.headers.get("v-c-correlation-id") ?? undefined;
  if (!response.ok) {
    const errorBody = await safeParseErrorBody(response);
    const reason =
      errorBody?.errorInformation?.reason ??
      errorBody?.errors?.[0]?.reason ??
      errorBody?.response?.rmsg;
    const code = errorBody?.errors?.find(
      (entry): entry is CybersourceErrorEntry & { code: string } => typeof entry.code === "string",
    )?.code;
    const messages = (errorBody?.errors ?? [])
      .map((entry) => [entry.location, entry.message].filter(isString).join(": ") || entry.message)
      .filter((message): message is string => typeof message === "string" && message.length > 0)
      .map((message) => message.slice(0, 300));
    logger.error(
      { path: pathWithQuery, status: response.status, code, reason, requestId, messages },
      "Cybersource API error response",
    );
    throw new CybersourceApiError(`Cybersource API error (HTTP ${response.status}).`, {
      status: response.status,
      reason: typeof reason === "string" ? reason.slice(0, 300) : undefined,
      code,
      requestId,
      messages,
      transient: response.status >= 500 || response.status === 429,
    });
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Some Unified Checkout endpoints return the JWT as a raw/quoted string.
    return text;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

async function safeParseErrorBody(response: Response): Promise<CybersourceErrorBody | undefined> {
  try {
    return (await response.json()) as CybersourceErrorBody;
  } catch {
    return undefined;
  }
}
