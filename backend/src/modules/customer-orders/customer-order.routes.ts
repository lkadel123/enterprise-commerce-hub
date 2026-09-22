import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerOrderController } from "./customer-order.controller.js";
import {
  createCustomerOrderSchema,
  customerOrderListQuerySchema,
  customerOrderParamsSchema,
} from "./customer-order.validator.js";

/**
 * Customer self-service order endpoints (mounted at /api/v1/customer/orders).
 *
 * Deliberately separate from the admin /api/v1/orders surface. All routes
 * require an authenticated customer session. Customer identity is derived
 * exclusively from req.customer (→ CustomerAccount → linked CRM Customer);
 * a client-supplied customer id is never trusted. Ownership is enforced at
 * the database query level, and all financial values are computed
 * server-side by the existing authoritative order engine.
 */
const router = Router();

router.use(customerAuthenticate);
router.use(apiRateLimiter);

/**
 * POST /api/v1/customer/orders
 * Place an order. Line items may be supplied in the body or, when omitted,
 * checked out from the customer's server cart.
 */
router.post("/", validate(createCustomerOrderSchema, "body"), customerOrderController.create);

/**
 * GET /api/v1/customer/orders
 * List the authenticated customer's order history (paginated).
 */
router.get("/", validate(customerOrderListQuerySchema, "query"), customerOrderController.list);

/**
 * GET /api/v1/customer/orders/:id
 * Order detail — ownership scoped to the authenticated customer.
 */
router.get("/:id", validate(customerOrderParamsSchema, "params"), customerOrderController.getById);

/**
 * GET /api/v1/customer/orders/:id/tracking
 * Customer-safe order tracking (status + timeline) — ownership scoped.
 */
router.get(
  "/:id/tracking",
  validate(customerOrderParamsSchema, "params"),
  customerOrderController.getTracking,
);

export { router as customerOrdersRouter };
