import { badRequest, notFound, serviceUnavailable } from "../../utils/ApiError.js";
import { orderRepository, type OrderPatch } from "../orders/order.repository.js";
import type { PaymentProvider } from "../orders/order.model.js";
import { logger } from "../../utils/logger.js";
import { env } from "../../config/env.js";
import { getPaymentProvider } from "./payment.providers.js";

const AMOUNT_TOLERANCE = 0.01; // 1 paisa tolerance for rounding

/**
 * Amount tolerance in minor units (1 paisa) for provider verification — the
 * gateway session amount must equal the server-side order total exactly.
 */
const AMOUNT_MINOR_TOLERANCE = 1;

/** Convert a major-unit amount to integer minor units for exact comparison. */
function toMinor(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

const paymentService = {
  /**
   * Initiate a payment for an order.
   * This creates a hosted-checkout session and updates the order.
   */
  async initiatePayment(
    orderId: string,
    provider: string,
    clientAmount: number,
    customerInfo: Record<string, unknown>,
  ) {
    const order = await orderRepository.findByIdPopulated(orderId);
    if (!order) {
      throw notFound("Order not found.");
    }

    // Check order status
    if (order.payment.status === "Paid") {
      logger.warn({ orderId, provider }, "Payment initiation: order already paid");
      return {
        status: "Paid" as const,
        providerTransactionId: order.payment.providerTransactionId || "",
        paymentUrl: "",
      };
    }

    // F-08: an order in a terminal/irrecoverable status can never be paid.
    if (["Cancelled", "Expired", "Refunded"].includes(order.status)) {
      throw badRequest(`Cannot initiate payment for a ${order.status.toLowerCase()} order.`);
    }

    // F-08: failed/cancelled/refunded payments require the documented new-order
    // workflow, not a second gateway session. An "Expired" session may be
    // re-initiated (the documented retry path).
    if (["Failed", "Cancelled", "Refunded"].includes(order.payment.status)) {
      throw badRequest(`Cannot initiate payment for order in "${order.payment.status}" status.`);
    }

    // Validate provider (only registered online gateways are accepted)
    const validProviders = ["CYBERSOURCE", "FONEPAY"];
    if (!validProviders.includes(provider.toUpperCase())) {
      throw badRequest(`Unsupported payment provider: ${provider}`);
    }

    // Use server-authoritative amount (amount in major currency units)
    const authoritativeAmount = order.amounts.total;

    // Phase 12: a client that disagrees with the server order total is a bug or
    // tampering — reject it instead of logging and continuing. The server amount
    // remains the authoritative charge.
    if (Math.abs(clientAmount - authoritativeAmount) > AMOUNT_TOLERANCE) {
      logger.warn(
        { orderId, clientAmount, serverAmount: authoritativeAmount },
        "Amount mismatch: client amount does not match server amount",
      );
      throw badRequest(
        `Order total mismatch: the submitted amount (${clientAmount}) does not match ` +
          `the server order total (${authoritativeAmount}). Refresh and try again.`,
      );
    }

    const providerInstance = getPaymentProvider(provider);

    try {
      const result = await providerInstance.initiate(authoritativeAmount, orderId, customerInfo);

      // Update order with payment initiation details
      const initiationPatch: OrderPatch = {
        "payment.provider": provider.toUpperCase() as PaymentProvider,
        "payment.providerTransactionId": result.providerTransactionId,
        "payment.status": "Initiated",
        "payment.initiatedAt": new Date(),
        "payment.amount": authoritativeAmount,
        "payment.currency": result.currency ?? env.PAYMENT_DEFAULT_CURRENCY.toUpperCase(),
      };
      await orderRepository.updateById(orderId, initiationPatch);

      logger.info(
        {
          orderId,
          provider,
          transactionId: result.providerTransactionId,
          amount: authoritativeAmount,
        },
        "Payment initiated successfully",
      );

      return {
        status: "Initiated" as const,
        providerTransactionId: result.providerTransactionId,
        paymentUrl: result.paymentUrl,
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      logger.error({ orderId, provider, error }, "Payment initiation failed");
      throw error;
    }
  },

  /**
   * Verify a payment after the customer returns from a hosted checkout.
   * This performs a server-to-server gateway lookup and marks the
   * order Paid only after the gateway confirms the transaction. The browser
   * return URL alone is never proof of payment — settlement is decided by
   * server-side verification only.
   */
  async verifyPayment(provider: string, providerTransactionId: string, signature?: string) {
    logger.info({ provider, transactionId: providerTransactionId }, "Payment verification started");

    // The transaction must be bound to a known order; an unbound transaction id
    // has nothing to update and is rejected before contacting the provider.
    const existingOrder = await orderRepository.findByTransactionId(providerTransactionId);
    if (!existingOrder) {
      throw notFound("Payment transaction not found.");
    }

    const orderId = existingOrder._id.toString();
    const currentStatus = existingOrder.payment.status;

    // Idempotency / terminal guards — a payment that has already reached one of
    // these states is never re-processed (mirrors the customer verify path).
    if (currentStatus === "Paid") {
      logger.info(
        { transactionId: providerTransactionId, status: currentStatus, orderId },
        "Payment already processed (idempotent callback)",
      );
      return {
        status: currentStatus,
        amount: existingOrder.payment.amount || 0,
        orderId,
        duplicate: true,
      };
    }
    if (currentStatus === "Refunded" || currentStatus === "Cancelled") {
      throw badRequest(`Order's payment is already "${currentStatus}".`);
    }
    if (currentStatus === "Failed" || currentStatus === "Expired") {
      // A failed/expired session requires a fresh initiation; never auto-promote.
      return {
        status: currentStatus,
        amount: existingOrder.payment.amount || 0,
        orderId,
        duplicate: true,
      };
    }

    // F-06: an order in a terminal status must never become Paid, no matter
    // what the gateway session reports.
    if (["Cancelled", "Expired", "Refunded"].includes(existingOrder.status)) {
      throw badRequest(
        `Order is ${existingOrder.status.toLowerCase()}; payment verification is not allowed.`,
      );
    }

    // Validate provider (only registered online gateways are accepted)
    if (!["CYBERSOURCE", "FONEPAY"].includes(provider.toUpperCase())) {
      throw badRequest(`Unsupported payment provider: ${provider}`);
    }

    // Get the provider instance and verify payment
    const providerInstance = getPaymentProvider(provider);

    let verification;
    try {
      verification = await providerInstance.verify(providerTransactionId, signature || "", {});
    } catch (error) {
      logger.error({ transactionId: providerTransactionId, error }, "Payment verification failed");
      // Provider uncertainty must never become a definite payment state.
      throw serviceUnavailable("Payment gateway unavailable.");
    }

    if (verification.status === "Paid") {
      // F-06: the server-side order total is authoritative — the gateway
      // session amount must match it exactly (compared in minor units).
      const expectedMinor = toMinor(existingOrder.amounts.total);
      const providerAmountMinor = toMinor(verification.amount ?? 0);
      if (Math.abs(providerAmountMinor - expectedMinor) > AMOUNT_MINOR_TOLERANCE) {
        logger.warn(
          { orderId, transactionId: providerTransactionId, expectedMinor, providerAmountMinor },
          "Payment amount mismatch — not marking Paid",
        );
        await orderRepository.updateById(orderId, {
          "payment.status": "Failed",
          "payment.failureReason": "Payment amount mismatch.",
        });
        return {
          status: "Failed" as const,
          amount: verification.amount ?? 0,
          orderId,
          duplicate: false,
        };
      }

      // Currency check — the session currency must match the order's stored
      // payment currency (falls back to the store's default payment currency).
      const sessionCurrency =
        typeof verification.metadata?.currency === "string"
          ? verification.metadata.currency.toUpperCase()
          : null;
      const expectedCurrency =
        existingOrder.payment.currency?.toUpperCase() || env.PAYMENT_DEFAULT_CURRENCY.toUpperCase();
      if (sessionCurrency && sessionCurrency !== expectedCurrency) {
        logger.warn(
          { orderId, transactionId: providerTransactionId, sessionCurrency, expectedCurrency },
          "Payment currency mismatch — not marking Paid",
        );
        await orderRepository.updateById(orderId, {
          "payment.status": "Failed",
          "payment.failureReason": "Payment currency mismatch.",
        });
        return {
          status: "Failed" as const,
          amount: verification.amount ?? 0,
          orderId,
          duplicate: false,
        };
      }

      // Atomic finalization — the guarded findOneAndUpdate only matches an
      // order that is still payable, closing the verify-vs-cancel/expire race
      // (the same canonical transition used by the webhook/customer paths).
      const providerTransaction = providerTransactionId;
      const paid = await orderRepository.markPaidIfPayable(orderId, {
        transactionId: providerTransaction,
        paidAt: new Date(),
      });
      if (!paid) {
        const current = await orderRepository.findByIdPopulated(orderId);
        if (current && current.payment.status === "Paid") {
          return {
            status: "Paid" as const,
            amount: current.payment.amount || 0,
            orderId,
            duplicate: true,
          };
        }
        throw badRequest("Order is no longer payable; payment was not captured.");
      }

      await orderRepository.updateById(orderId, {
        "payment.providerTransactionId": providerTransactionId,
        "payment.amount": existingOrder.amounts.total,
        "payment.currency": expectedCurrency,
        "payment.metadata": {
          ...(existingOrder.payment.metadata ?? {}),
          ...(verification.metadata ?? {}),
        },
      });

      logger.info(
        { orderId, transactionId: providerTransactionId, amount: existingOrder.amounts.total },
        "Order payment verified and marked Paid",
      );
      return {
        status: "Paid" as const,
        amount: existingOrder.amounts.total,
        orderId,
        duplicate: false,
      };
    }

    // Non-Paid verification outcomes (Failed/Cancelled/Expired/Pending) are
    // recorded verbatim — they can never produce a Paid state.
    const update: OrderPatch = {
      "payment.status": verification.status,
    };

    if (verification.status === "Failed") {
      update["payment.failureReason"] =
        typeof verification.metadata?.error === "string"
          ? verification.metadata.error
          : "Payment verification failed";
    }

    if (verification.metadata) {
      update["payment.metadata"] = verification.metadata;
    }

    await orderRepository.updateById(orderId, update);

    logger.info(
      { orderId, transactionId: providerTransactionId, status: verification.status },
      "Order payment status updated",
    );
    return {
      status: verification.status,
      amount: verification.amount ?? 0,
      orderId,
      duplicate: false,
    };
  },

  /**
   * Get current payment status for an order.
   */
  async getPaymentStatus(orderId: string) {
    const order = await orderRepository.findByIdPopulated(orderId);
    if (!order) {
      throw notFound("Order not found.");
    }

    return {
      status: order.payment.status,
      provider: order.payment.provider || null,
      method: order.payment.method,
      transactionId: order.payment.transactionId || null,
      providerTransactionId: order.payment.providerTransactionId || null,
      amount: order.payment.amount || null,
      currency: order.payment.currency || env.PAYMENT_DEFAULT_CURRENCY.toUpperCase(),
      initiatedAt: order.payment.initiatedAt
        ? new Date(order.payment.initiatedAt).toISOString()
        : null,
      paidAt: order.payment.paidAt ? new Date(order.payment.paidAt).toISOString() : null,
      failureReason: order.payment.failureReason || null,
    };
  },
};

export { paymentService };
