/**
 * Payment providers.
 *
 * ACTIVE (only these can be initiated, verified or reached by any code path —
 * see `payment.providers.ts`):
 *   - "FONEPAY"      Fonepay QR / Intent Checkout (direct Fonepay API).
 *   - "CYBERSOURCE"  Unified Checkout card payments (direct Cybersource API).
 *
 * NON-GATEWAY:
 *   - "COD"           Cash on Delivery — no provider transaction at all.
 *   - "BANK_TRANSFER" Offline transfer settled manually by an admin.
 *
 * HISTORICAL ONLY — retained so pre-existing order documents keep validating.
 * These values can never be reached by active code: they are absent from
 * `ACTIVE_PAYMENT_PROVIDERS` / `CUSTOMER_PAYMENT_GATEWAYS` and are not present
 * in the provider registry, so `getPaymentProvider(...)` fails closed.
 *   - "PAYBRIDGE"  retired intermediary aggregator.
 *   - "KHALTI"     retired gateway.
 *   - "ESEWA"      retired gateway.
 */
export type PaymentProvider =
  | "FONEPAY"
  | "CYBERSOURCE"
  | "COD"
  | "BANK_TRANSFER"
  // Historical values (read-only — never initiable).
  | "PAYBRIDGE"
  | "KHALTI"
  | "ESEWA";

/**
 * Payment status types — must match order model's PAYMENT_STATUSES.
 * "Expired" applies to expired QR/payment attempts (Fonepay Dynamic QR).
 */
export const PAYMENT_STATUSES = [
  "Paid",
  "Pending",
  "Refunded",
  "Failed",
  "Initiated",
  "Cancelled",
  "Expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Payment method types */
export const PAYMENT_METHODS = [
  "Credit Card",
  "Cash on Delivery",
  "Digital Wallet",
  "Bank Transfer",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
