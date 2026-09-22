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

/** True when every required Fonepay credential is present. */
export function isFonepayConfigured(): boolean {
  return (
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
 *   `FP` + last 10 chars of the order id + 8 random base36 chars  (20 chars)
 * - alphanumeric only, ≤ 30 chars (Fonepay requirement)
 * - unique per payment ATTEMPT (Fonepay QRs are single-use; a retry must
 *   generate a NEW reference — never reuse one that hit a 409 duplicate)
 * - traceable: the order-id fragment binds it to the commerce order, and the
 *   full value is stored in `payment.providerTransactionId` +
 *   `payment.metadata.fonepay.referenceLabel`.
 */
export function generateFonepayReferenceLabel(orderId: string): string {
  const orderFragment = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
  let random = "";
  for (let i = 0; i < 8; i += 1) {
    random += Math.floor(Math.random() * 36).toString(36);
  }
  return `FP${orderFragment}${random}`.slice(0, 30);
}

/**
 * Map a Fonepay status response to the order payment status vocabulary.
 * Centralized here so no code compares raw Fonepay strings elsewhere.
 */
export function mapFonepayStatus(status: string): "Paid" | "Pending" | "Failed" {
  switch (status.toLowerCase()) {
    case "success":
      return "Paid";
    case "pending":
      return "Pending";
    case "failed":
    default:
      // Unknown statuses fail closed — never mark Paid on an unrecognized value.
      return "Failed";
  }
}
