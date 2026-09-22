import QRCode from "qrcode";

import {
  FONEPAY_CURRENCY,
  FONEPAY_QR_WAIT_WINDOW_MS,
  generateFonepayReferenceLabel,
  mapFonepayStatus,
  toFonepayAmount,
} from "./fonepay.config.js";
import {
  configuredFonepayTerminalId,
  generateFonepayIntentQr,
  getFonepayPaymentStatus,
} from "./fonepay.client.js";
import type {
  PaymentProviderInterface,
  ProviderRefundResult,
  RefundCapability,
} from "../../payment.provider.js";
import type { PaymentStatus } from "../../payment.types.js";

/**
 * Fonepay QR / Intent Checkout provider.
 *
 * Flow (documented "Checkout Intent Flow" V1.10):
 *  1. `initiate` generates an INTENT_QR with the SERVER-side order amount
 *     (decimal rupees) and a unique, order-bound `referenceLabel`. The response
 *     carries the QR payload (`qrString`), the Fonepay `prn` and a per-QR
 *     `websocketId` URL. The QR PNG data URL is rendered server-side with the
 *     already-installed `qrcode` package, so the storefront needs no new
 *     dependency and never sees provider credentials.
 *  2. The customer scans the QR and pays through a Fonepay-supported banking
 *     app. The backend listens on the `websocketId` WebSocket — that message is
 *     a NOTIFICATION ONLY and never settles anything.
 *  3. `verify`/`getStatus` call the documented Status API
 *     (`thirdPartyDynamicQrGetStatus`) and validate reference, terminal and
 *     amounts BEFORE the payment service's atomic `markPaidIfPayable` can run.
 *
 * The Fonepay document defines NO refund API — refunds stay UNSUPPORTED and the
 * existing documented status-only refund flow applies (Phase 16E).
 */
export class FonepayProvider implements PaymentProviderInterface {
  /** Safe, persistence-ready provider metadata (no credentials/tokens). */
  private fonepayMeta(fields: Record<string, unknown>): Record<string, unknown> {
    return { fonepay: fields };
  }

  async initiate(
    amount: number,
    orderId: string,
    _customerInfo: Record<string, unknown>,
  ): Promise<{
    paymentId: string;
    providerTransactionId: string;
    paymentUrl: string;
    expiresAt: Date;
    currency: string;
    metadata?: Record<string, unknown>;
  }> {
    const fonepayAmount = toFonepayAmount(amount); // validates 1..9,999,999
    const referenceLabel = generateFonepayReferenceLabel(orderId);
    const terminalId = configuredFonepayTerminalId();

    const qr = await generateFonepayIntentQr({
      amount: fonepayAmount,
      billId: orderId, // deterministic Order._id → Fonepay billId mapping
      terminalId,
      paymentMode: "QR",
      referenceLabel,
      qrType: "INTENT_QR", // fixed for Fonepay checkout per the API document
    });

    const qrPayload = qr.qrString;
    // Server-side QR rendering with the existing `qrcode` dependency — the
    // storefront receives a plain PNG data URL.
    const qrImage = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
    });

    const prn = typeof qr.prn === "string" && qr.prn ? qr.prn : referenceLabel;

    return {
      paymentId: prn,
      providerTransactionId: referenceLabel,
      // The Fonepay flow has no redirect: payment happens by scanning the QR.
      paymentUrl: "",
      // Fonepay documents NO QR expiry; this is the merchant-side wait window
      // after which the storefront stops waiting and the customer re-initiates.
      expiresAt: new Date(Date.now() + FONEPAY_QR_WAIT_WINDOW_MS),
      currency: FONEPAY_CURRENCY,
      metadata: this.fonepayMeta({
        referenceLabel,
        prn,
        terminalId,
        billId: orderId,
        amount: fonepayAmount,
        qrString: qrPayload,
        qrImage,
        displayName: qr.qrDisplayName ?? null,
        websocketId: qr.websocketId ?? null,
        location: qr.location ?? null,
        createdAt: new Date().toISOString(),
      }),
    };
  }

  /**
   * Authoritative verification via the documented Status API.
   *
   * Validation performed here (in addition to the service's amount check):
   * - `prn` must equal the expected `referenceLabel`;
   * - `merchantCode` must equal the configured terminal id;
   * - `requestedAmount` and `totalTransactionAmount` must agree with each other.
   * Any violation fails the payment CLOSED — never Pending, never Paid.
   */
  async verify(
    providerTransactionId: string,
    _signature: string,
  ): Promise<{
    status: PaymentStatus;
    amount: number;
    verifiedAt: Date;
    metadata?: Record<string, unknown>;
  }> {
    const result = await this.queryStatus(providerTransactionId);
    return {
      status: result.status,
      amount: result.amount,
      verifiedAt: new Date(),
      metadata: result.metadata,
    };
  }

  /** Authoritative status polling fallback (same Status API, no verifiedAt). */
  async getStatus(providerTransactionId: string): Promise<{
    status: PaymentStatus;
    amount: number;
    metadata?: Record<string, unknown>;
  }> {
    const result = await this.queryStatus(providerTransactionId);
    return { status: result.status, amount: result.amount, metadata: result.metadata };
  }

  /** Shared Status API query + verification rules. */
  private async queryStatus(referenceLabel: string): Promise<{
    status: PaymentStatus;
    amount: number;
    metadata?: Record<string, unknown>;
  }> {
    const terminalId = configuredFonepayTerminalId();
    const status = await getFonepayPaymentStatus({ terminalId, referenceLabel });

    // Reference binding: the provider must echo OUR reference back.
    if (status.prn !== referenceLabel) {
      return {
        status: "Failed",
        amount: 0,
        metadata: this.fonepayMeta({
          referenceLabel,
          error: "Payment reference mismatch.",
          providerPrn: status.prn,
          verifiedAt: new Date().toISOString(),
        }),
      };
    }

    // Terminal binding: the status must belong to OUR configured merchant.
    if (status.merchantCode !== terminalId) {
      return {
        status: "Failed",
        amount: 0,
        metadata: this.fonepayMeta({
          referenceLabel,
          error: "Payment terminal mismatch.",
          verifiedAt: new Date().toISOString(),
        }),
      };
    }

    // Decimal-safe amounts: Fonepay reports strings like "100.00" (rupees).
    const requestedAmount = FonepayProvider.parseAmount(status.requestedAmount);
    const totalAmount = FonepayProvider.parseAmount(status.totalTransactionAmount);
    if (
      requestedAmount !== null &&
      totalAmount !== null &&
      Math.abs(requestedAmount - totalAmount) > 0.005
    ) {
      return {
        status: "Failed",
        amount: requestedAmount,
        metadata: this.fonepayMeta({
          referenceLabel,
          error: "Fonepay reported amounts disagree.",
          requestedAmount: status.requestedAmount ?? null,
          totalTransactionAmount: status.totalTransactionAmount ?? null,
          verifiedAt: new Date().toISOString(),
        }),
      };
    }

    const mapped = mapFonepayStatus(status.paymentStatus);
    return {
      status: mapped,
      amount: requestedAmount ?? 0,
      metadata: this.fonepayMeta({
        referenceLabel,
        prn: status.prn,
        merchantCode: status.merchantCode,
        paymentStatus: status.paymentStatus,
        fonepayTraceId: status.fonepayTraceId ?? null,
        requestedAmount: status.requestedAmount ?? null,
        totalTransactionAmount: status.totalTransactionAmount ?? null,
        paymentMessage: status.paymentMessage ?? null,
        verifiedAt: new Date().toISOString(),
      }),
    };
  }

  /** Parse a Fonepay decimal amount ("100.00" or 100) — null when absent/invalid. */
  private static parseAmount(value: string | number | undefined): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  /** Fonepay defines no cancellation API — pending QRs simply expire by themselves. */
  refundCapability(): RefundCapability {
    return "UNSUPPORTED";
  }

  refund?(_providerTransactionId: string, _amountMajor: number): Promise<ProviderRefundResult> {
    return Promise.resolve({
      status: "FAILED",
      message: "Fonepay does not document a refund API; refunds are handled manually.",
    });
  }
}
