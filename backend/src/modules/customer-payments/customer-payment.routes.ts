import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter, authActionRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerPaymentController } from "./customer-payment.controller.js";
import {
  customerPaymentInitiateSchema,
  customerPaymentParamsSchema,
  customerPaymentVerifySchema,
} from "./customer-payment.validator.js";

/**
 * Customer payment surface — mounted at /api/v1/customer/payments.
 *
 * Deliberately separate from the admin /api/v1/payments surface. All mutation
 * and status routes require an authenticated customer session (customer
 * identity from req.customer only).
 *
 * Online payment gateways (Cybersource Unified Checkout, Fonepay QR):
 * initiation creates a server-side session (server amount); the customer pays
 * inside the gateway's own surface (embedded Unified Checkout iframe or QR
 * code); settlement is decided exclusively by server-side verification
 * (`verify` endpoint re-checks the gateway API / verifies the signed response
 * token). No public unauthenticated callback route is exposed.
 */
const router = Router();

// General per-request limiter for the whole payment surface.
router.use(apiRateLimiter);

/**
 * POST /api/v1/customer/payments/:orderId/initiate
 * Create a gateway payment session for a customer-owned order. The
 * amount is always the server order total; the response carries the
 * gateway-specific client data (Cybersource capture context, Fonepay QR).
 */
router.post(
  "/:orderId/initiate",
  customerAuthenticate,
  authActionRateLimiter,
  validate(customerPaymentParamsSchema, "params"),
  validate(customerPaymentInitiateSchema, "body"),
  customerPaymentController.initiate,
);

/**
 * POST /api/v1/customer/payments/:orderId/verify
 * Server-side verification of the gateway payment (the authoritative
 * settlement path). Stricter limiter.
 */
router.post(
  "/:orderId/verify",
  customerAuthenticate,
  authActionRateLimiter,
  validate(customerPaymentParamsSchema, "params"),
  validate(customerPaymentVerifySchema, "body"),
  customerPaymentController.verify,
);

/**
 * GET /api/v1/customer/payments/:orderId/status
 * Poll current customer-safe payment status (ownership scoped).
 */
router.get(
  "/:orderId/status",
  customerAuthenticate,
  validate(customerPaymentParamsSchema, "params"),
  customerPaymentController.getStatus,
);

/**
 * POST /api/v1/customer/payments/:orderId/cancel
 * Cancel a pending payment attempt (Pending/Initiated → Cancelled).
 */
router.post(
  "/:orderId/cancel",
  customerAuthenticate,
  authActionRateLimiter,
  validate(customerPaymentParamsSchema, "params"),
  customerPaymentController.cancel,
);

export { router as customerPaymentsRouter };
