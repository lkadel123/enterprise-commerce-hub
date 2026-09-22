import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { paymentController } from "./payment.controller.js";
import {
  initiatePaymentSchema,
  verifyPaymentSchema,
  setOrderPaymentSchema,
} from "./payment.validator.js";
import { orderParamsSchema } from "../orders/order.validator.js";
import { paymentProviderMap } from "./payment.providers.js";

export { paymentProviderMap };

const router = Router();

/** Initiate a payment for an order with a selected provider. */
router.post(
  "/initiate",
  authenticate,
  requirePermission("orders", "edit"),
  validate(initiatePaymentSchema),
  paymentController.initiatePayment,
);

/** Verify a payment callback (idempotent). */
router.post(
  "/verify",
  authenticate,
  requirePermission("orders", "edit"),
  validate(verifyPaymentSchema),
  paymentController.verifyPayment,
);

/** Poll current payment status for an order. */
router.get(
  "/status/:id",
  authenticate,
  requirePermission("orders", "view"),
  validate(orderParamsSchema, "params"),
  paymentController.getPaymentStatus,
);

/**
 * Manually set an order's payment status (e.g. COD confirmation).
 * NOTE: online gateways settle exclusively through server-side verification
 * on the customer payments surface — there is no public callback route here.
 */
router.patch(
  "/:id/payment",
  authenticate,
  requirePermission("orders", "edit"),
  validate(orderParamsSchema, "params"),
  validate(setOrderPaymentSchema),
  paymentController.setOrderPayment,
);

export { router as paymentsRouter };
