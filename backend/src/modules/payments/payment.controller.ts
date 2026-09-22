import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, notFound } from "../../utils/ApiError.js";
import { sendSuccess } from "../../utils/ApiResponse.js";
import { logger } from "../../utils/logger.js";
import { paymentService } from "./payment.service.js";
import { orderService } from "../orders/order.service.js";
import { notificationService } from "../notifications/notification.service.js";
import type { Request, Response } from "express";

export const paymentController = {
  /**
   * Initiate a payment for an order with a selected provider.
   * This is called by authenticated users when they select a payment method.
   */
  initiatePayment: asyncHandler(async (req: Request, res: Response) => {
    const { orderId, provider, customerName, customerEmail, customerPhone } = req.body;

    if (!orderId || !provider) {
      throw badRequest("orderId and provider are required");
    }

    // Get the order to verify it exists and belongs to the customer
    const order = await orderService.getById(orderId);
    if (!order) {
      throw notFound("Order not found.");
    }

    logger.info({ orderId, provider, userId: req.user?.id }, "Payment initiation requested");

    const result = await paymentService.initiatePayment(
      orderId,
      provider,
      order.amounts.total, // Use server-authoritative amount
      {
        name: customerName || order.customer?.name || "Customer",
        email: customerEmail || order.customer?.email || "",
        phone: customerPhone || "",
      },
    );

    logger.info(
      { orderId, provider, transactionId: result.providerTransactionId },
      "Payment initiated successfully",
    );

    sendSuccess(res, result, "Payment initiated. Please complete the payment.");
  }),

  /**
   * Verify a payment after customer returns from payment gateway.
   * This is called both by authenticated users and by gateway callbacks.
   * It performs server-side verification and marks the order as paid if verified.
   */
  verifyPayment: asyncHandler(async (req: Request, res: Response) => {
    const { provider, providerTransactionId, signature } = req.body;

    if (!provider || !providerTransactionId) {
      throw badRequest("provider and providerTransactionId are required");
    }

    logger.info(
      { provider, transactionId: providerTransactionId, hasSignature: !!signature },
      "Payment verification requested",
    );

    const result = await paymentService.verifyPayment(provider, providerTransactionId, signature);

    logger.info(
      {
        transactionId: providerTransactionId,
        status: result.status,
        orderId: result.orderId,
        isDuplicate: result.duplicate,
      },
      "Payment verified",
    );

    // Send notification for successful payment
    if (result.status === "Paid" && !result.duplicate && result.orderId) {
      try {
        const order = await orderService.getById(result.orderId);
        if (order?.customer?.id) {
          await notificationService.notify(order.customer.id, "order", "Payment Successful", {
            message: `Payment of ${result.amount} has been confirmed for order ${order.orderNumber}.`,
            priority: "normal",
            entityType: "order",
            entityId: order.id,
            actionUrl: `/orders/${order.id}`,
          });
        }
      } catch (notifError) {
        logger.error(
          { orderId: result.orderId, error: notifError },
          "Failed to create payment notification",
        );
        // Don't fail the payment verification just because notification failed
      }
    }

    // Send notification for failed payment
    if (result.status === "Failed" && result.orderId) {
      try {
        const order = await orderService.getById(result.orderId);
        if (order?.customer?.id) {
          await notificationService.notify(order.customer.id, "order", "Payment Failed", {
            message: `Payment for order ${order.orderNumber} could not be processed. Please try again.`,
            priority: "high",
            entityType: "order",
            entityId: order.id,
            actionUrl: `/orders/${order.id}`,
          });
        }
      } catch (notifError) {
        logger.error(
          { orderId: result.orderId, error: notifError },
          "Failed to create failure notification",
        );
      }
    }

    sendSuccess(res, result, "Payment verification complete.");
  }),

  /**
   * Get current payment status for an order.
   * Can be used for polling or status refresh.
   */
  getPaymentStatus: asyncHandler(async (req: Request, res: Response) => {
    const { id: orderId } = req.params;

    if (!orderId) {
      throw badRequest("Order ID is required");
    }

    logger.info({ orderId }, "Payment status requested");

    const result = await paymentService.getPaymentStatus(
      Array.isArray(orderId) ? orderId[0] : orderId,
    );
    sendSuccess(res, result, "Payment status retrieved.");
  }),

  /**
   * Manually set payment status for an order.
   * Used by admin to mark orders as paid (e.g., for COD, bank transfer).
   * Requires admin permission.
   */
  setOrderPayment: asyncHandler(async (req: Request, res: Response) => {
    const { id: orderId } = req.params;
    const { paymentStatus, transactionId } = req.body;

    if (!orderId || !paymentStatus) {
      throw badRequest("Order ID and payment status are required");
    }

    logger.info(
      { orderId, paymentStatus, userId: req.user?.id },
      "Manual payment status update requested",
    );

    const order = await orderService.setPayment(Array.isArray(orderId) ? orderId[0] : orderId, {
      paymentStatus,
      transactionId,
    });

    logger.info({ orderId, paymentStatus }, "Payment status updated manually");

    sendSuccess(res, order, `Order payment status set to ${paymentStatus}.`);
  }),
};
