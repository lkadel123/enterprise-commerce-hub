import type { ZodError, ZodIssue } from "zod";

/**
 * Redaction-safe diagnostics for Fonepay provider responses.
 *
 * WHY THIS EXISTS
 * A provider body that failed contract validation used to reach the logs as
 * nothing but `errorType: "ZodError"` (see `fonepay.client.ts`). That made a
 * live HTTP 200 mismatch impossible to diagnose: the log proved a QR response
 * did not match the schema, but not WHICH field failed, what was expected, or
 * what actually arrived. These helpers answer exactly those three questions
 * without ever copying provider data into a log line.
 *
 * REDACTION POLICY (structural, not by convention)
 * Everything returned by this module is built from:
 * - field NAMES taken from the provider body (contract vocabulary, e.g.
 *   `qrString`) — names are static API surface, values are not;
 * - wire TYPE labels computed from the body (`"string"`, `"object"`, `"null"`, …);
 * - array element COUNTS;
 * - Zod issue codes plus the expected/received TYPE descriptors
 *   (`invalid_type`) and numeric length bounds (`too_small`/`too_big`).
 *
 * Never returned: any string/number VALUE from the payload, the QR payload
 * (`qrString`), signing material, access tokens, customer data or provider
 * message text — with one deliberate exception, `describeFonepayApplicationFailure`,
 * which surfaces a short bounded provider status/message so an operator can act
 * on a rejection (bounds documented on that function).
 *
 * Zod issue `message` strings are deliberately NOT copied: several codes
 * (`invalid_enum_value`, `invalid_literal`) embed the RECEIVED VALUE in
 * `message`/`expected`/`received`, so a violation on a provider field could echo
 * a QR payload or customer data into the logs.
 */

/** Wire type label used in place of a provider value. */
export type FonepayPayloadType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "array"
  | "object"
  | "function"
  | "other";

/**
 * Shape summary of a provider body: names, types and counts only.
 *
 * `keys`/`fieldTypes` reveal a WRAPPED payload immediately (e.g. a body that is
 * `{ data: { qrString } }` reports `keys: ["data"]` and
 * `nestedKeys: { data: ["qrString"] }`) without exposing a single value.
 */
export interface FonepayPayloadSummary {
  /** Wire type of the body itself. */
  type: FonepayPayloadType;
  /** Object bodies: top-level field names, in payload order (capped). */
  keys?: string[];
  /** Object bodies: `field -> wire type`, so a mistyped field is obvious. */
  fieldTypes?: Record<string, FonepayPayloadType>;
  /** Object bodies: `field -> nested field names` for object-valued fields. */
  nestedKeys?: Record<string, string[]>;
  /** Array bodies: element count (elements themselves are not inspected). */
  items?: number;
}

/** Value-free description of one Zod contract violation. */
export interface FonepayIssueSummary {
  /** Dotted path of the offending contract field (`"(root)"` for the body itself). */
  path: string;
  /** Zod issue code, e.g. `invalid_type`, `too_small`, `invalid_union`. */
  code: string;
  /** Expected TYPE for `invalid_type` / `too_small` / `too_big` issues. */
  expected?: string;
  /** Received TYPE for `invalid_type` issues — never a received value. */
  received?: string;
  /** Numeric bound text for length/count issues, e.g. `>= 1 (string)`. */
  constraint?: string;
}

/**
 * Diagnostics attached to a rejected provider response: safe to log verbatim.
 * Shaped as `{ responseShape, issues }` so it can be spread straight into a
 * structured log line.
 */
export interface FonepayResponseDiagnostics {
  /** Shape of the body that failed validation. */
  responseShape: FonepayPayloadSummary;
  /** Contract violations (absent for a provider-reported failure). */
  issues?: FonepayIssueSummary[];
}

/** Caps so a hostile/oversized provider body cannot flood the logs. */
const FONEPAY_MAX_SUMMARY_KEYS = 50;
const FONEPAY_MAX_NESTED_KEYS = 25;
const FONEPAY_MAX_ISSUES = 10;

/**
 * Provider failure fields, in priority order.
 *
 * `message` is what Fonepay returns on a rejected request (HTTP 400/409 and
 * `failed()` bodies); `error` is what its auth/generic envelopes use;
 * `qrMessage` is the human-readable message documented in the QR response
 * itself, so it doubles as the failure reason when no QR payload came back.
 */
const FONEPAY_FAILURE_MESSAGE_KEYS = ["message", "error", "qrMessage"] as const;

/** Provider status/message values are truncated to this many characters. */
const FONEPAY_MAX_PROVIDER_TEXT = 200;
/** Provider status codes are short words; anything longer is truncated. */
const FONEPAY_MAX_PROVIDER_STATUS = 40;

/** Wire type of a JSON-parsed value — never its content. */
function wireTypeOf(value: unknown): FonepayPayloadType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const primitive = typeof value;
  if (
    primitive === "string" ||
    primitive === "number" ||
    primitive === "boolean" ||
    primitive === "undefined" ||
    primitive === "object" ||
    primitive === "function"
  ) {
    return primitive;
  }
  // `bigint` / `symbol` — never produced by `JSON.parse`, listed for safety.
  return "other";
}

/** True for a JSON object body (arrays and primitives are not records). */
function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Summarize a provider body as names/types/counts.
 *
 * Called only with `JSON.parse`d payloads (plain data), so reading keys cannot
 * trigger application logic. Never throws: an unexpected value shape degrades to
 * a type label.
 */
export function summarizeFonepayPayload(raw: unknown): FonepayPayloadSummary {
  const type = wireTypeOf(raw);
  if (type === "array") {
    return { type, items: (raw as unknown[]).length };
  }
  if (type !== "object") {
    return { type };
  }

  const entries = Object.entries(raw as Record<string, unknown>).slice(0, FONEPAY_MAX_SUMMARY_KEYS);
  const fieldTypes: Record<string, FonepayPayloadType> = {};
  const nestedKeys: Record<string, string[]> = {};
  for (const [key, value] of entries) {
    const valueType = wireTypeOf(value);
    fieldTypes[key] = valueType;
    if (valueType === "object") {
      nestedKeys[key] = Object.keys(value as Record<string, unknown>).slice(
        0,
        FONEPAY_MAX_NESTED_KEYS,
      );
    }
  }

  return {
    type,
    keys: entries.map(([key]) => key),
    fieldTypes,
    ...(Object.keys(nestedKeys).length > 0 ? { nestedKeys } : {}),
  };
}

/** Map one Zod issue onto its value-free descriptor. */
function summarizeIssue(issue: ZodIssue): FonepayIssueSummary {
  const summary: FonepayIssueSummary = {
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    code: issue.code,
  };

  if (issue.code === "invalid_type") {
    summary.expected = issue.expected;
    summary.received = issue.received;
    return summary;
  }
  if (issue.code === "too_small") {
    summary.expected = issue.type;
    summary.constraint = `${issue.inclusive ? ">=" : ">"} ${issue.minimum} (${issue.type})`;
    return summary;
  }
  if (issue.code === "too_big") {
    summary.expected = issue.type;
    summary.constraint = `${issue.inclusive ? "<=" : "<"} ${issue.maximum} (${issue.type})`;
    return summary;
  }
  // Every other code is reported by code+path only: `invalid_enum_value` and
  // `invalid_literal` carry the RECEIVED VALUE in their descriptor fields.
  return summary;
}

/**
 * Summarize contract violations from a failed parse: issue path, code, expected
 * type, received type and length bounds — no messages, no received values.
 */
export function summarizeFonepayIssues(error: ZodError): FonepayIssueSummary[] {
  return error.issues.slice(0, FONEPAY_MAX_ISSUES).map(summarizeIssue);
}

/** Collapse whitespace and cap length — provider text is never logged raw. */
function sanitizeProviderText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Recognize an HTTP 200 application-level failure.
 *
 * Fonepay answers a rejected QR request with a `message`/`error` body (and the
 * documented QR response itself carries `qrMessage`), while a SUCCESS response
 * always carries the payable payload in `qrString`. When such a body arrives
 * without a usable `qrString`, the request did NOT produce a QR: it must not be
 * reported as a schema violation (which hides the provider's reason) and must
 * never be treated as a success.
 *
 * Deliberate distinctions:
 * - a non-empty `qrString` is never a failure — the caller only reaches this
 *   after schema validation already failed, so this guard is a safety net;
 * - a WRONG-TYPED `qrString` (object/number/boolean/array) stays a contract
 *   violation: the provider claimed a payload we cannot read, which must remain
 *   a hard, visible error instead of being downgraded to a provider message;
 * - absent/`null`/empty `qrString` with a provider status or message is an
 *   application-level failure.
 *
 * Returns a bounded, single-line reason (provider message truncated to 200
 * characters, or a short `status` value truncated to 40) — or `undefined` when
 * the body has to be treated as a contract violation instead.
 */
export function describeFonepayApplicationFailure(raw: unknown): string | undefined {
  if (!isJsonRecord(raw)) return undefined;

  const qrString = raw.qrString;
  if (typeof qrString === "string" && qrString.trim().length > 0) return undefined;
  if (qrString !== undefined && qrString !== null && typeof qrString !== "string") return undefined;

  for (const key of FONEPAY_FAILURE_MESSAGE_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return `Fonepay rejected the QR request: ${sanitizeProviderText(value, FONEPAY_MAX_PROVIDER_TEXT)}`;
    }
  }

  // A status word with no message and no QR payload is still an application-level
  // outcome; the documented success body always carries a QR payload.
  const status = raw.status;
  if (typeof status === "string" && status.trim().length > 0) {
    return `Fonepay returned a QR response with no QR payload (status: ${sanitizeProviderText(
      status,
      FONEPAY_MAX_PROVIDER_STATUS,
    )}).`;
  }

  return undefined;
}
