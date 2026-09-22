import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerAddressController } from "./customer-address.controller.js";
import {
  createCustomerAddressSchema,
  customerAddressParamsSchema,
  updateCustomerAddressSchema,
} from "./customer-address.validator.js";

/**
 * Customer self-service address book endpoints (mounted at
 * /api/v1/customer/addresses).
 *
 * All routes require an authenticated customer session; customer identity is
 * derived exclusively from req.customer (CustomerAccount id). A client-supplied
 * customer id is never trusted, and every repository query is scoped to the
 * authenticated account, preventing IDOR across customers.
 */
const router = Router();

router.use(customerAuthenticate);
router.use(apiRateLimiter);

/**
 * GET /api/v1/customer/addresses
 * List the authenticated customer's addresses (ownership-scoped).
 */
router.get("/", customerAddressController.list);

/**
 * POST /api/v1/customer/addresses
 * Create a new address for the authenticated customer.
 */
router.post("/", validate(createCustomerAddressSchema, "body"), customerAddressController.create);

/**
 * GET /api/v1/customer/addresses/:id
 * Address detail — ownership scoped to the authenticated customer.
 */
router.get(
  "/:id",
  validate(customerAddressParamsSchema, "params"),
  customerAddressController.getById,
);

/**
 * PATCH /api/v1/customer/addresses/:id
 * Update an address — ownership scoped.
 */
router.patch(
  "/:id",
  validate(customerAddressParamsSchema, "params"),
  validate(updateCustomerAddressSchema, "body"),
  customerAddressController.update,
);

/**
 * DELETE /api/v1/customer/addresses/:id
 * Delete an address — ownership scoped.
 */
router.delete(
  "/:id",
  validate(customerAddressParamsSchema, "params"),
  customerAddressController.remove,
);

export { router as customerAddressesRouter };
