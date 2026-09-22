import type { PaymentMethod, PaymentProvider, PaymentStatus } from "../orders/order.model.js";

/**
 * Gateways exposed on the customer payment surface.
 *
 * Direct provider integrations only — no intermediary aggregator:
 * - FONEPAY      Fonepay QR / Intent Checkout (Nepal, NPR).
 * - CYBERSOURCE  Card payments via Unified Checkout.
 * - COD          Cash on Delivery — non-gateway; no provider transaction is
 *                ever created and no gateway is called.
 *
 * Registered server-side only when the provider's credentials are configured;
 * otherwise initiation fails closed (503). Retired providers (PAYBRIDGE /
 * KHALTI / ESEWA) remain in the order provider enum for historical data ONLY
 * and are deliberately absent here so they cannot be initiated.
 */
export const CUSTOMER_PAYMENT_GATEWAYS = ["COD", "FONEPAY", "CYBERSOURCE"] as const;
export type CustomerPaymentGateway = (typeof CUSTOMER_PAYMENT_GATEWAYS)[number];

/**
 * Customer-safe payment projection. Only information the customer storefront
 * needs is exposed. Never secrets, provider API responses, or internal state.
 *
 * Financial values (amount/currency) are always read from the server-side
 * Order record — never from any client-supplied value.
 */
export interface CustomerPaymentDto {
  orderId: string;
  gateway: PaymentProvider | null;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId: string | null;
  providerTransactionId: string | null;
  amount: number | null;
  currency: string;
  initiatedAt: string | null;
  paidAt: string | null;
  failureReason: string | null;
  /**
   * Redirect-based handoff URL. Present only when the gateway redirects the
   * browser; never proof of payment.
   */
  paymentUrl?: string | null;
  expiresAt?: string | null;
  /**
   * Fonepay QR — server-rendered PNG data URL of the Fonepay intent QR payload.
   * Display only: the customer scans it with a Fonepay-supported banking app.
   * Generated server-side from the provider's `qrString`; contains no secrets.
   */
  qrImage?: string | null;
  /** Fonepay merchant display name from the QR response (e.g. store name). */
  qrDisplayName?: string | null;
  /**
   * Cybersource Unified Checkout public session data (capture context /
   * client library URL + SRI). Public, one-time data from the Sessions API —
   * contains no secrets. Present only when the provider is CYBERSOURCE.
   */
  clientToken?: string | null;
}

/** A payment operation result with an idempotency (`duplicate`) flag. */
export interface CustomerPaymentResult {
  payment: CustomerPaymentDto;
  duplicate: boolean;
}

/**
 * Customer-initiated payment verification input (NO financial fields).
 * The transaction reference must match the reference stored at initiation and
 * is looked up server-side through the provider's own API.
 */
export interface CustomerPaymentVerifyInput {
  gateway: CustomerPaymentGateway;
  providerTransactionId: string;
  /**
   * Cybersource Unified Checkout only: the Cybersource-signed payment
   * response token (JWT) produced by the Unified Checkout SDK after the
   * customer completes payment. Opaque to this service — the provider
   * verifies the RS256 signature, binds the merchant reference, and checks
   * the amount server-side. Never a financial field.
   */
  responseToken?: string;
}
