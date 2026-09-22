import type { PaymentStatus } from "./payment.types.js";

/** Refund capability + outcome status (Phase 16E). */
export type RefundCapability = "SUPPORTED" | "UNSUPPORTED";
export type RefundOutcome = "PENDING" | "SUCCESS" | "FAILED";

export interface ProviderRefundResult {
  status: RefundOutcome;
  providerRef?: string;
  message?: string;
}

/**
 * Additional (gateway-specific) verification inputs.
 *
 * - Cybersource Unified Checkout (Complete Mandate) carries its outcome in a
 *   Cybersource-signed (RS256) response token produced by
 *   `unifiedPayments.complete()`; the storefront forwards that opaque token
 *   here. No financial fields are ever accepted from the client.
 * - Fonepay verifies via the Fonepay Status API.
 */
export interface ProviderVerifyOptions {
  /** Cybersource-signed payment response token (JWT) from Unified Checkout. */
  responseToken?: string;
}

/** Payment provider abstraction. All gateway providers must implement this interface. */
export interface PaymentProviderInterface {
  /** Initiate a payment for a given order amount */
  initiate(
    amount: number,
    orderId: string,
    customerInfo: Record<string, unknown>,
  ): Promise<{
    paymentId: string;
    providerTransactionId: string;
    /**
     * Redirect-based gateways return the URL the browser should be sent to.
     * QR/embedded gateways (Fonepay QR, Cybersource Unified Checkout) return
     * "" — the QR data URL / capture context travels through `metadata`
     * instead.
     */
    paymentUrl: string;
    expiresAt: Date;
    /**
     * ISO currency code the provider settled on (e.g. "NPR"). Providers that
     * do not supply one fall back to the configured default payment currency.
     */
    currency?: string;
    /**
     * Provider-specific safe metadata persisted to `order.payment.metadata`
     * (e.g. Fonepay QR payload/image, PRN, websocket URL; Cybersource capture
     * context). Must never contain provider credentials or access tokens.
     */
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Best-effort gateway-side cancellation of a pending payment attempt.
   * Optional — providers without a cancellation API simply omit it.
   */
  cancel?(providerTransactionId: string): Promise<void>;

  /**
   * Verify a payment callback / result from the gateway. Amount is reported
   * in MAJOR currency units (e.g. 21.5 for 21.50).
   */
  verify(
    providerTransactionId: string,
    signature: string,
    options?: ProviderVerifyOptions,
  ): Promise<{
    status: PaymentStatus;
    amount: number;
    verifiedAt: Date;
    metadata?: Record<string, unknown>;
  }>;

  /** Get current payment status */
  getStatus(providerTransactionId: string): Promise<{
    status: PaymentStatus;
    amount: number;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Whether this gateway can move money back to the customer. Providers without
   * a usable refund API/credentials return "UNSUPPORTED"; the order/refund flow
   * then performs a documented status-only refund (Phase 16E). When "SUPPORTED",
   * {@link refund} is used and the order is only marked Refunded after the gateway
   * confirms success.
   */
  refundCapability(): RefundCapability;

  /**
   * Request a refund through the gateway. Only invoked when {@link refundCapability}
   * returns "SUPPORTED". Amount is always the server-authoritative captured amount.
   */
  refund?(
    providerTransactionId: string,
    amount: number,
  ): Promise<ProviderRefundResult>;
}
