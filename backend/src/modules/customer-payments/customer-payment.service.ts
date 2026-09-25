import { badRequest, notFound, serviceUnavailable } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";
import { env } from "../../config/env.js";
import { ensureCrmCustomer } from "../customer-orders/customer-order.service.js";
import { customerAuthRepository } from "../customer-auth/customer-auth.repository.js";
import { orderRepository, type OrderPatch } from "../orders/order.repository.js";
import type { IOrderTimelineEntry, PaymentStatus } from "../orders/order.model.js";
import type { OrderRecord } from "../orders/order.types.js";
import { getPaymentProvider, isProviderEnabled } from "../payments/payment.providers.js";
import {
  closeFonepayMonitor,
  monitorFonepayPayment,
} from "../payments/providers/fonepay/fonepay.websocket.js";
import { customerPaymentRepository } from "./customer-payment.repository.js";
import { CUSTOMER_PAYMENT_GATEWAY_CATALOG } from "./customer-payment.types.js";
import type {
  CustomerPaymentDto,
  CustomerPaymentGateway,
  CustomerPaymentGatewayOption,
  CustomerPaymentResult,
  CustomerPaymentVerifyInput,
} from "./customer-payment.types.js";
import { notificationService } from "../notifications/notification.service.js";

/**
 * Amount tolerance in minor units (1 paisa). Provider amounts are reported in
 * MAJOR currency units by the provider wrapper; final comparison happens in
 * paisa against the server-side order total.
 */
const AMOUNT_MINOR_TOLERANCE = 1;

/** Convert a major-unit amount to integer minor units for exact comparison. */
function toMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

/**
 * SAFE provider diagnostics for logs — never includes credentials, request
 * headers, signatures, API keys, or raw provider payloads. Only primitive
 * error metadata is serialized.
 */
function providerDiagnostics(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorType: error.name,
      message: error.message.slice(0, 300),
    };
  }
  return {
    errorType: typeof error,
    message: String(error).slice(0, 300),
  };
}

/** Build the customer-safe payment DTO from the authoritative order record. */
function toCustomerPaymentDto(order: OrderRecord): CustomerPaymentDto {
  const gatewayMeta = order.payment.metadata as
    { paymentUrl?: unknown; expiresAt?: unknown } | undefined;
  const fonepayMeta = order.payment.metadata?.fonepay as
    { qrImage?: unknown; displayName?: unknown } | undefined;
  // Cybersource Unified Checkout public session data (server-created
  // Sessions API response): the capture-context JWT the browser uses to
  // render Cybersource's own iframe. Contains NO credentials and NO
  // financial authority — the amount/currency stay server-side.
  const cybersourceMeta = order.payment.metadata?.cybersource as
    { captureContext?: unknown } | undefined;

  const payment: CustomerPaymentDto = {
    orderId: order._id.toString(),
    gateway: order.payment.provider ?? null,
    method: order.payment.method,
    status: order.payment.status,
    transactionId: order.payment.transactionId ?? null,
    providerTransactionId: order.payment.providerTransactionId ?? null,
    amount: order.payment.amount ?? null,
    currency: order.payment.currency ?? env.PAYMENT_DEFAULT_CURRENCY.toUpperCase(),
    initiatedAt: order.payment.initiatedAt
      ? new Date(order.payment.initiatedAt).toISOString()
      : null,
    paidAt: order.payment.paidAt ? new Date(order.payment.paidAt).toISOString() : null,
    failureReason: order.payment.failureReason ?? null,
    // Fonepay QR projection — display-only PNG data URL + merchant name. Present
    // only for Fonepay orders; secrets never enter payment.metadata.
    qrImage: typeof fonepayMeta?.qrImage === "string" ? fonepayMeta.qrImage : null,
    qrDisplayName: typeof fonepayMeta?.displayName === "string" ? fonepayMeta.displayName : null,
    // Hosted-checkout gateways — the checkout URL from the live session is
    // DISPLAY/redirect data only; it is never proof of payment.
    paymentUrl: typeof gatewayMeta?.paymentUrl === "string" ? gatewayMeta.paymentUrl : null,
    expiresAt: typeof gatewayMeta?.expiresAt === "string" ? gatewayMeta.expiresAt : null,
    // Cybersource Unified Checkout — public, one-time capture context for the
    // embedded SDK. Present only for CYBERSOURCE payments.
    clientToken:
      typeof cybersourceMeta?.captureContext === "string" ? cybersourceMeta.captureContext : null,
  };
  return payment;
}

/** Authoritative server-side customer info supplied to the gateway. */
function customerContactFor(order: OrderRecord): Record<string, unknown> {
  const address = order.addresses?.billing ?? order.addresses?.shipping ?? null;
  return {
    name: order.customer?.name ?? "",
    email: order.email ?? "",
    phone: "",
    ...(address
      ? {
          address: {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country,
          },
        }
      : {}),
  };
}

/**
 * Apply a verified provider status to the order (state guard + timeline
 * entry). `metadata` (when provided) replaces `payment.metadata` — callers pass
 * the fully merged object.
 */
async function applyVerifiedStatus(
  orderId: string,
  status: PaymentStatus,
  transactionId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const patch: OrderPatch = { "payment.status": status };
  let entry: IOrderTimelineEntry | undefined;

  if (status === "Paid") {
    patch["payment.paidAt"] = new Date();
    patch["payment.failureReason"] = null;
    if (transactionId) patch["payment.transactionId"] = transactionId;
    entry = { label: "Payment Paid", at: new Date(), done: true };
  } else if (status === "Failed") {
    patch["payment.failureReason"] = "Payment verification failed.";
    entry = { label: "Payment Failed", at: new Date(), done: true };
  } else if (status === "Expired") {
    entry = { label: "Payment Expired", at: new Date(), done: true };
  } else if (status === "Cancelled") {
    entry = { label: "Payment Cancelled", at: new Date(), done: true };
  }

  if (metadata) {
    patch["payment.metadata"] = metadata;
  }

  await orderRepository.updateById(orderId, patch, entry);
}

const customerPaymentService = {
  /**
   * Initiate a payment for one of the authenticated customer's orders.
   * Creates a hosted-checkout session. The payable amount is taken
   * from `Order.amounts.total` (server-side). A client-supplied amount is
   * rejected at validation time and never read.
   */
  async initiate(
    customerAccountId: string,
    orderId: string,
    gateway: CustomerPaymentGateway,
  ): Promise<CustomerPaymentResult> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);

    const order = await customerPaymentRepository.findByIdForCustomer(orderId, crmCustomerId);
    if (!order) throw notFound("Order not found.");

    // Idempotent / terminal guards (customer-safe messages).
    if (order.payment.status === "Paid") {
      return { payment: toCustomerPaymentDto(order), duplicate: true };
    }
    if (order.status === "Cancelled") {
      throw badRequest("Cannot initiate payment for a cancelled order.");
    }
    if (order.status === "Expired") {
      throw badRequest("Order has expired. Please place a new order.");
    }
    // Failed/Cancelled/Expired PAYMENTS may be re-initiated — this is the
    // gateway retry path. Settlement is still guarded atomically by
    // markPaidIfPayable(), so a re-initiation can never resurrect a Paid order.
    if (order.payment.status === "Refunded") {
      throw badRequest("Cannot initiate payment for a refunded order.");
    }

    // Fonepay QR re-request safety (refresh / double-click / multiple tabs):
    // a Pending/Initiated Fonepay attempt already owns an open QR for this
    // order. The STORED QR envelope is returned — Fonepay is NOT called again,
    // so no second payable reference can ever exist for the same order. The
    // customer can still start a genuinely new QR through the explicit
    // "Cancel payment" → re-initiate path (Cancelled may be re-initiated).
    if (
      gateway === "FONEPAY" &&
      order.payment.provider === "FONEPAY" &&
      (order.payment.status === "Initiated" || order.payment.status === "Pending") &&
      order.payment.providerTransactionId
    ) {
      logger.info(
        {
          provider: "FONEPAY",
          orderId,
          referenceLabel: order.payment.providerTransactionId,
        },
        "Fonepay QR re-requested — reusing the existing reference",
      );
      return { payment: toCustomerPaymentDto(order), duplicate: true };
    }

    const provider = getPaymentProvider(gateway);
    const authoritativeAmount = order.amounts.total;

    let initiated;
    try {
      initiated = await provider.initiate(authoritativeAmount, orderId, customerContactFor(order));
    } catch (error) {
      logger.error(
        {
          orderId,
          gateway,
          ...(error instanceof Error
            ? { errorType: error.name, message: error.message.slice(0, 300) }
            : { errorType: typeof error }),
        },
        "Customer payment initiation failed",
      );
      throw serviceUnavailable("Payment gateway unavailable.");
    }

    // Gateway-aware persistence: each gateway stores its own safe session data
    // in `payment.metadata` (Fonepay → `metadata.fonepay` QR envelope,
    // Cybersource → `metadata.cybersource` public session). No credentials, no
    // access tokens. The currency comes from the provider (Fonepay → NPR;
    // Cybersource → its configured settlement currency).
    await orderRepository.updateById(orderId, {
      "payment.provider": gateway,
      "payment.providerTransactionId": initiated.providerTransactionId,
      "payment.status": "Initiated",
      "payment.initiatedAt": new Date(),
      "payment.amount": authoritativeAmount,
      "payment.currency": initiated.currency ?? env.PAYMENT_DEFAULT_CURRENCY.toUpperCase(),
      "payment.metadata": {
        ...(order.payment.metadata ?? {}),
        ...(initiated.metadata ?? {}),
      },
    });

    const updated = await orderRepository.findByIdPopulated(orderId);
    const payment = updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order);

    // Fonepay: start the BACKEND WebSocket listener for this QR (notification
    // only — settlement happens exclusively through Status API verification).
    if (gateway === "FONEPAY") {
      const fonepayMeta = (initiated.metadata?.fonepay ?? {}) as {
        referenceLabel?: string;
        websocketId?: string | null;
      };
      if (fonepayMeta.referenceLabel && fonepayMeta.websocketId) {
        monitorFonepayPayment({
          referenceLabel: fonepayMeta.referenceLabel,
          websocketUrl: fonepayMeta.websocketId,
          onPaymentNotification: async () => {
            await customerPaymentService.verifyFonepayNotification(
              orderId,
              fonepayMeta.referenceLabel!,
            );
          },
        });
      }
    }

    // Phase 8: the payment_initiated notification is emitted ONLY after the
    // provider initiation succeeded AND the Initiated state was persisted.
    // A notification failure must never fail a successful initiation.
    try {
      const accountId = await customerAuthRepository.findAccountIdByCrmCustomerId(crmCustomerId);
      if (accountId) {
        await notificationService.notifyCustomer(
          accountId,
          "payment_initiated",
          `Payment initiated for order ${orderId}`,
          {
            entityType: "order",
            entityId: orderId,
            actionUrl: `/account/orders/${orderId}`,
            metadata: { orderId, gateway },
          },
        );
      }
    } catch (notifyError) {
      logger.error(
        { orderId, error: notifyError },
        "Failed to create payment initiated notification",
      );
    }

    logger.info(
      {
        orderId,
        gateway,
        transactionId: initiated.providerTransactionId,
        amount: authoritativeAmount,
      },
      "Customer payment initiated",
    );

    return { payment, duplicate: false };
  },
  /**
   * Verify a payment for a customer-owned order (server-to-server gateway
   * lookup). The transaction reference must match the one stored at
   * initiation and the provider-confirmed amount must match the server-side
   * order total, otherwise the payment is rejected and never marked Paid.
   */
  async verify(
    customerAccountId: string,
    orderId: string,
    input: CustomerPaymentVerifyInput,
  ): Promise<CustomerPaymentResult> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const order = await customerPaymentRepository.findByIdForCustomer(orderId, crmCustomerId);
    if (!order) throw notFound("Order not found.");

    const storedReference = order.payment.providerTransactionId;
    if (!storedReference) {
      throw badRequest("Payment not initiated.");
    }
    if (storedReference !== input.providerTransactionId) {
      throw badRequest("Invalid payment transaction.");
    }
    if (order.payment.provider && order.payment.provider !== input.gateway) {
      throw badRequest("Invalid payment transaction.");
    }

    return this.verifyResolvedOrder(order, input);
  },

  /**
   * Shared verification core — idempotent, amount-checked. Ownership is
   * enforced by the caller via the ownership-scoped order lookup.
   */
  async verifyResolvedOrder(
    order: OrderRecord,
    input: CustomerPaymentVerifyInput,
  ): Promise<CustomerPaymentResult> {
    const orderId = order._id.toString();
    const currentStatus = order.payment.status;
    const crmCustomerId = order.customer!._id.toString();

    // Customer notifications are keyed by CustomerAccount id; resolve the
    // account linked to this CRM customer.
    const accountId = await customerAuthRepository.findAccountIdByCrmCustomerId(crmCustomerId);

    // Terminal-state guards — never regress a payment.
    if (currentStatus === "Paid") {
      return { payment: toCustomerPaymentDto(order), duplicate: true };
    }
    if (["Refunded", "Cancelled"].includes(currentStatus)) {
      throw badRequest(`Order's payment is already "${currentStatus}".`);
    }
    if (currentStatus === "Failed") {
      // A failed payment requires a fresh initiation; do not auto-promote.
      return { payment: toCustomerPaymentDto(order), duplicate: true };
    }
    if (currentStatus === "Expired") {
      // An expired session requires regeneration (a new initiation).
      return { payment: toCustomerPaymentDto(order), duplicate: true };
    }

    // Phase 16F: an expired or cancelled order must never become Paid.
    if (order.status === "Expired") {
      throw badRequest("Order has expired. Please place a new order.");
    }
    if (order.status === "Cancelled") {
      throw badRequest("Order is cancelled; payment verification is not allowed.");
    }

    let verification;
    try {
      verification = await getPaymentProvider(input.gateway).verify(
        input.providerTransactionId,
        "",
        { responseToken: input.responseToken },
      );
    } catch (error) {
      logger.error(
        {
          orderId,
          gateway: input.gateway,
          transactionId: input.providerTransactionId,
          ...providerDiagnostics(error),
          operation: "verify_payment",
        },
        "Customer payment verification failed",
      );
      throw serviceUnavailable("Payment gateway unavailable.");
    }
    // Provider amounts are MAJOR currency units — compare in minor units.
    const providerAmountMinor = toMinor(verification.amount);

    if (verification.status === "Paid") {
      const expectedMinor = toMinor(order.amounts.total);
      if (Math.abs(providerAmountMinor - expectedMinor) > AMOUNT_MINOR_TOLERANCE) {
        logger.warn(
          {
            orderId,
            gateway: input.gateway,
            transactionId: input.providerTransactionId,
            expectedMinor,
            providerAmountMinor,
          },
          "Customer payment amount mismatch — not marking Paid",
        );
        await applyVerifiedStatus(orderId, "Failed", null, {
          ...(order.payment.metadata ?? {}),
          failureReason: "Payment amount mismatch.",
        });
        const updated = await orderRepository.findByIdPopulated(orderId);
        return {
          payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
          duplicate: false,
        };
      }
      // Currency binding: when the provider reports the currency it settled in,
      // it MUST be the currency this order's payment was initiated in (for
      // Fonepay that is always NPR; for Cybersource it is the merchant account
      // currency). The admin payment path already enforced this; the customer
      // path previously stored the provider currency without comparing it, so a
      // numerically-equal amount in the wrong currency could settle an order.
      const providerCurrency =
        typeof verification.metadata?.currency === "string" &&
        verification.metadata.currency.length > 0
          ? verification.metadata.currency.toUpperCase()
          : null;
      const expectedCurrency = (
        order.payment.currency ?? env.PAYMENT_DEFAULT_CURRENCY
      ).toUpperCase();
      if (providerCurrency !== null && providerCurrency !== expectedCurrency) {
        logger.warn(
          {
            orderId,
            gateway: input.gateway,
            transactionId: input.providerTransactionId,
            expectedCurrency,
            providerCurrency,
          },
          "Customer payment currency mismatch — not marking Paid",
        );
        await applyVerifiedStatus(orderId, "Failed", null, {
          ...(order.payment.metadata ?? {}),
          failureReason: "Payment currency mismatch.",
        });
        const updated = await orderRepository.findByIdPopulated(orderId);
        return {
          payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
          duplicate: false,
        };
      }

      // Amount verified: mark Paid ATOMICALLY (Phase 16F). The guarded
      // findOneAndUpdate only matches an order that is still payable, so a
      // concurrent cancel/expire wins safely.
      // `payment.transactionId` must be the GATEWAY's transaction identifier
      // from the verified provider response (e.g. Cybersource's numeric
      // transaction id in the signed token's `id` field) — NOT the per-attempt
      // merchant reference, which belongs in `payment.providerTransactionId`.
      // Gateways that don't return one fall back to the stored reference so
      // legacy flows keep a usable idempotency key.
      const gatewayTransactionId =
        typeof verification.metadata?.transactionId === "string" &&
        verification.metadata.transactionId.length > 0
          ? verification.metadata.transactionId
          : input.providerTransactionId;

      const paid = await orderRepository.markPaidIfPayable(orderId, {
        transactionId: gatewayTransactionId,
        paidAt: new Date(),
      });
      if (!paid) {
        const current = await orderRepository.findByIdPopulated(orderId);
        if (current && current.payment.status === "Paid") {
          return { payment: toCustomerPaymentDto(current), duplicate: true };
        }
        throw badRequest("Order is no longer payable; payment was not captured.");
      }
      await orderRepository.updateById(orderId, {
        "payment.providerTransactionId": input.providerTransactionId,
        "payment.amount": order.amounts.total,
        // The provider's settled currency (Cybersource settles in the currency
        // configured on the merchant account, which may differ from NPR);
        // otherwise the store's default payment currency.
        "payment.currency":
          typeof verification.metadata?.currency === "string" &&
          verification.metadata.currency.length > 0
            ? verification.metadata.currency
            : env.PAYMENT_DEFAULT_CURRENCY.toUpperCase(),
        "payment.metadata": {
          ...(order.payment.metadata ?? {}),
          ...(verification.metadata ?? {}),
        },
      });

      // Notify customer of payment success (non-blocking, best-effort)
      try {
        if (accountId) {
          await notificationService.notifyCustomer(
            accountId,
            "payment_successful",
            `Payment successful for order ${orderId}`,
            {
              entityType: "order",
              entityId: orderId,
              actionUrl: `/account/orders/${orderId}`,
              metadata: { orderId, transactionId: gatewayTransactionId },
            },
          );
        }
      } catch (notifyError) {
        /* non-fatal */ logger.error(
          { orderId, crmCustomerId, error: notifyError },
          "Failed to create payment successful notification",
        );
      }

      const updated = await orderRepository.findByIdPopulated(orderId);
      logger.info(
        { orderId, gateway: input.gateway, transactionId: gatewayTransactionId },
        "Customer payment marked Paid",
      );
      return {
        payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
        duplicate: false,
      };
    }

    if (verification.status === "Failed") {
      await applyVerifiedStatus(orderId, "Failed", null, {
        ...(order.payment.metadata ?? {}),
        ...(verification.metadata ?? {}),
      });

      // Notify customer of payment failure (non-blocking, best-effort)
      try {
        if (accountId) {
          await notificationService.notifyCustomer(
            accountId,
            "payment_failed",
            `Payment failed for order ${orderId}`,
            {
              entityType: "order",
              entityId: orderId,
              actionUrl: `/account/orders/${orderId}`,
              metadata: { orderId, failureReason: "Payment verification failed" },
            },
          );
        }
      } catch (notifyError) {
        /* non-fatal */ logger.error(
          { orderId, crmCustomerId, error: notifyError },
          "Failed to create payment failed notification",
        );
      }

      const updated = await orderRepository.findByIdPopulated(orderId);
      return {
        payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
        duplicate: false,
      };
    }

    if (verification.status === "Expired" || verification.status === "Cancelled") {
      // Gateway-side expired/cancelled outcomes — non-terminal for the ORDER
      // (a fresh initiation is still possible), terminal for the attempt.
      await applyVerifiedStatus(orderId, verification.status, null, {
        ...(order.payment.metadata ?? {}),
        ...(verification.metadata ?? {}),
      });
      const updated = await orderRepository.findByIdPopulated(orderId);
      return {
        payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
        duplicate: false,
      };
    }

    // Non-terminal (Pending/Initiated): reflect gateway state.
    await orderRepository.updateById(orderId, { "payment.status": "Pending" });
    const updated = await orderRepository.findByIdPopulated(orderId);
    return {
      payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
      duplicate: false,
    };
  },
  /**
   * Fonepay WebSocket-notification path (backend-internal; NOT exposed as an
   * API). A WebSocket paymentSuccess message is only a trigger — this method
   * re-verifies the transaction through the Fonepay Status API by running the
   * SAME guarded core (verifyResolvedOrder) used by the customer verify path,
   * so settlement stays idempotent, amount-checked and atomic
   * (markPaidIfPayable). Unknown/stale references and foreign providers are
   * ignored, never processed.
   */
  async verifyFonepayNotification(orderId: string, referenceLabel: string): Promise<void> {
    const order = await orderRepository.findByIdPopulated(orderId);
    if (!order || order.payment.provider !== "FONEPAY") {
      logger.debug(
        { provider: "FONEPAY", orderId, referenceLabel },
        "Fonepay notification ignored (unknown order or provider)",
      );
      return;
    }
    if (order.payment.providerTransactionId !== referenceLabel) {
      logger.debug(
        { provider: "FONEPAY", orderId, referenceLabel },
        "Fonepay notification ignored (stale or unknown reference)",
      );
      return;
    }

    await this.verifyResolvedOrder(order, {
      gateway: "FONEPAY",
      providerTransactionId: referenceLabel,
    });

    // Terminal settlement reached — stop listening for this QR.
    const current = await orderRepository.findByIdPopulated(orderId);
    if (current && ["Paid", "Failed", "Cancelled", "Refunded"].includes(current.payment.status)) {
      closeFonepayMonitor(referenceLabel, "terminal_status");
    }
  },
  /**
   * Payment options the checkout may offer, with server-derived availability.
   *
   * The storefront renders ONLY what this returns as `available: true`, so a
   * gateway that is disabled / not fully configured (Fonepay by default) can
   * never be presented as a payment method — and enabling it on the server
   * makes it appear without a storefront deploy. Requires an authenticated
   * customer: availability is operational configuration, not public data.
   */
  getAvailableGateways(): CustomerPaymentGatewayOption[] {
    return CUSTOMER_PAYMENT_GATEWAY_CATALOG.map((option) => ({
      ...option,
      // COD is offline (no provider transaction at all) and always available;
      // every online gateway must be REGISTERED in the provider registry, which
      // only happens when it is enabled AND fully configured.
      available: option.gateway === "COD" ? true : isProviderEnabled(option.gateway),
    }));
  },

  /** Fetch the current customer-safe payment status (ownership scoped). */
  async getStatus(customerAccountId: string, orderId: string): Promise<CustomerPaymentDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const order = await customerPaymentRepository.findByIdForCustomer(orderId, crmCustomerId);
    if (!order) throw notFound("Order not found.");
    return toCustomerPaymentDto(order);
  },

  /**
   * Cancel a pending payment attempt (Pending/Initiated → Cancelled).
   * Idempotent for an already-cancelled payment; refuses to cancel Paid or
   * Refunded payments. Best-effort gateway-side session expiry when the
   * provider supports it.
   */
  async cancelPayment(customerAccountId: string, orderId: string): Promise<CustomerPaymentResult> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const order = await customerPaymentRepository.findByIdForCustomer(orderId, crmCustomerId);
    if (!order) throw notFound("Order not found.");

    if (order.status === "Expired" || order.status === "Cancelled") {
      throw badRequest("Order is no longer active.");
    }
    if (order.payment.status === "Cancelled") {
      return { payment: toCustomerPaymentDto(order), duplicate: true };
    }
    if (["Paid", "Refunded"].includes(order.payment.status)) {
      throw badRequest(`Cannot cancel a payment in "${order.payment.status}" status.`);
    }

    await orderRepository.updateById(
      order._id.toString(),
      { "payment.status": "Cancelled" },
      { label: "Payment Cancelled", at: new Date(), done: true },
    );
    logger.info(
      { orderId: order._id.toString(), gateway: order.payment.provider },
      "Customer payment cancelled",
    );

    const updated = await orderRepository.findByIdPopulated(order._id.toString());
    return {
      payment: updated ? toCustomerPaymentDto(updated) : toCustomerPaymentDto(order),
      duplicate: false,
    };
  },
};

export { customerPaymentService };
