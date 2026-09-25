import { randomBytes } from "node:crypto";

import { env } from "../../../../config/env.js";

/**
 * Fonepay QR / Intent Checkout configuration helpers.
 *
 * Amount semantics (documented conclusion — see the Fonepay implementation
 * report):
 * - The order system stores amounts in MAJOR units (e.g. 120.00 NPR).
 * - The Fonepay Intent QR API takes a DECIMAL rupee amount (`amount: 100.00`),
 *   range 1..9,999,999 — NO paisa conversion happens for the outbound request.
 * - Verification compares provider amounts against the server order total in
 *   MINOR units (×100, the shared "paisa" comparison used by the payment
 *   service) with the existing ±1 tolerance.
 *
 * SECURITY: credentials are read from environment variables only, never logged,
 * and never returned by any accessor that could reach the frontend.
 */

export const FONEPAY_PROVIDER = "FONEPAY" as const;

/** Fonepay Checkout operates in Nepal — NPR only. */
export const FONEPAY_CURRENCY = "NPR";

/** Documented Fonepay QR amount range (rupees). */
export const FONEPAY_MIN_AMOUNT = 1;
export const FONEPAY_MAX_AMOUNT = 9_999_999;

/**
 * Client-side QR wait window (30 minutes). Fonepay documents NO QR expiration;
 * this is ONLY the merchant-side window after which the storefront stops
 * polling/waiting and the customer must re-initiate. The Fonepay QR itself is
 * single-use per the API docs.
 */
export const FONEPAY_QR_WAIT_WINDOW_MS = 30 * 60 * 1000;

/**
 * True when the operator explicitly enabled the Fonepay gateway
 * (`FONEPAY_ENABLED=true`). Defaults to FALSE: Fonepay stays unregistered until
 * real merchant credentials and the gateway environment have been supplied, so
 * a storefront can never offer a gateway that is not actually usable.
 */
export function fonepayEnabled(): boolean {
  return env.FONEPAY_ENABLED;
}

/** Configured Fonepay gateway environment ("uat" | "production"). */
export function fonepayEnvironment(): string {
  return env.FONEPAY_ENVIRONMENT;
}

/** True when every required Fonepay credential is present AND it is enabled. */
export function isFonepayConfigured(): boolean {
  return (
    fonepayEnabled() &&
    env.FONEPAY_BASE_URL.length > 0 &&
    env.FONEPAY_USERNAME.length > 0 &&
    env.FONEPAY_PASSWORD.length > 0 &&
    env.FONEPAY_PRIVATE_KEY.length > 0 &&
    env.FONEPAY_TERMINAL_ID.length > 0
  );
}

/** Configured base URL, without a trailing slash. */
export function fonepayBaseUrl(): string {
  return env.FONEPAY_BASE_URL.replace(/\/+$/, "");
}

/** Configured merchant terminal id (also Fonepay's `merchantCode` in status responses). */
export function fonepayTerminalId(): string {
  return env.FONEPAY_TERMINAL_ID;
}

/** Outbound Fonepay API timeout (ms). */
export function fonepayTimeoutMs(): number {
  return env.FONEPAY_REQUEST_TIMEOUT_MS;
}

/**
 * Validate and normalize a server-authoritative amount for the Fonepay QR
 * request. Returns the decimal rupee amount rounded to 2 dp.
 * @throws when the amount is outside Fonepay's documented 1..9,999,999 range.
 */
export function toFonepayAmount(amountMajor: number): number {
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    throw new Error("Fonepay initiation requires a positive server-side amount.");
  }
  const rounded = Math.round(amountMajor * 100) / 100;
  if (rounded < FONEPAY_MIN_AMOUNT || rounded > FONEPAY_MAX_AMOUNT) {
    throw new Error(
      `Fonepay amount must be between ${FONEPAY_MIN_AMOUNT} and ${FONEPAY_MAX_AMOUNT}.`,
    );
  }
  return rounded;
}

/**
 * Collision-safe, traceable Fonepay `referenceLabel`:
 *   `FP` + last 10 chars of the order id + 10 CSPRNG hex chars  (≤ 22 chars)
 * - alphanumeric only, ≤ 30 chars (Fonepay requirement)
 * - unique per payment ATTEMPT (Fonepay QRs are single-use; a retry must
 *   generate a NEW reference — never reuse one that hit a 409 duplicate)
 * - traceable: the order-id fragment binds it to the commerce order, and the
 *   full value is stored in `payment.providerTransactionId` +
 *   `payment.metadata.fonepay.referenceLabel`.
 * - UNPREDICTABLE: the random suffix comes from `crypto.randomBytes` (a CSPRNG),
 *   not `Math.random()`. The reference travels inside the QR payload, so a
 *   guessable reference would let a third party construct a status query for a
 *   merchant's transaction.
 */
export function generateFonepayReferenceLabel(orderId: string): string {
  const orderFragment = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
  return `FP${orderFragment}${randomBytes(5).toString("hex")}`.slice(0, 30);
}

/**
 * Fonepay `paymentStatus` vocabulary → the order payment-status vocabulary.
 *
 * VERIFIED SUCCESS VALUES (two different Fonepay QR API families both feed this
 * integration's documentation history):
 *  - `success`   — the status value of the documented QR status API that
 *                  authenticates with an HMAC-SHA512 `dataValidation`.
 *  - `COMPLETED` — the status value of the v2 third-party PKI API this provider
 *                  calls (`/api/merchant/third-party/v2/thirdPartyDynamicQrGetStatus`);
 *                  a published client for exactly those endpoints asserts
 *                  `paymentStatus: "COMPLETED"` for a settled QR.
 * Fonepay is not consistent about casing, so every comparison is lowercased and
 * the synonym sets below cover both documented vocabularies plus the obvious
 * inflections. Nothing is guessed about AMOUNT — a `Paid` mapping still has to
 * pass the reference / terminal / amount / currency checks before the order can
 * settle, so a wrong mapping can never invent a payment.
 *
 * UNRECOGNIZED VALUES MAP TO `Pending` — not `Paid` (so an unknown string can
 * never settle an order) and not `Failed` (so a genuinely-paid transaction is
 * never falsified into a terminal failure that invites a second charge). A
 * stalled attempt is still terminated by the authoritative order-expiry sweep.
 */
const FONEPAY_PAID_STATUSES = new Set([
  "success",
  "successful",
  "completed",
  "complete",
  "paid",
  "captured",
  "settled",
]);
const FONEPAY_PENDING_STATUSES = new Set([
  "pending",
  "initiated",
  "processing",
  "in progress",
  "in-progress",
  "in_progress",
]);
const FONEPAY_CANCELLED_STATUSES = new Set(["cancelled", "canceled", "cancel"]);
const FONEPAY_EXPIRED_STATUSES = new Set(["expired", "timeout", "timed out", "timedout"]);
const FONEPAY_FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "declined",
  "decline",
  "rejected",
  "error",
]);

export type FonepayMappedStatus = "Paid" | "Pending" | "Failed" | "Cancelled" | "Expired";

/** True when the status is a RECOGNIZED Fonepay value (for diagnostics only). */
export function isRecognizedFonepayStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    FONEPAY_PAID_STATUSES.has(normalized) ||
    FONEPAY_PENDING_STATUSES.has(normalized) ||
    FONEPAY_CANCELLED_STATUSES.has(normalized) ||
    FONEPAY_EXPIRED_STATUSES.has(normalized) ||
    FONEPAY_FAILED_STATUSES.has(normalized)
  );
}

/**
 * Map a Fonepay status response to the order payment status vocabulary.
 * Centralized here so no code compares raw Fonepay strings elsewhere.
 */
export function mapFonepayStatus(status: string): FonepayMappedStatus {
  const normalized = status.trim().toLowerCase();
  if (FONEPAY_PAID_STATUSES.has(normalized)) return "Paid";
  if (FONEPAY_PENDING_STATUSES.has(normalized)) return "Pending";
  if (FONEPAY_CANCELLED_STATUSES.has(normalized)) return "Cancelled";
  if (FONEPAY_EXPIRED_STATUSES.has(normalized)) return "Expired";
  if (FONEPAY_FAILED_STATUSES.has(normalized)) return "Failed";
  // Unknown vocabulary: never Paid, never a falsely terminal failure.
  return "Pending";
}
