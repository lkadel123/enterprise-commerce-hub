import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerReviewController } from "./customer-review.controller.js";
import {
  createCustomerReviewSchema,
  customerReviewListQuerySchema,
} from "./customer-review.validator.js";

/**
 * Customer self-service review surface (mounted at /api/v1/customer/reviews).
 *
 * Deliberately separate from the admin /api/v1/reviews moderation surface.
 * All routes require an authenticated customer session. Customer identity is
 * derived exclusively from req.customer (→ CustomerAccount → linked CRM
 * Customer); a client-supplied customer id is never trusted. Review status is
 * always forced to "Pending" server-side.
 */
const router = Router();

router.use(customerAuthenticate);
router.use(apiRateLimiter);

/** POST /api/v1/customer/reviews — submit a review (status forced Pending). */
router.post("/", validate(createCustomerReviewSchema, "body"), customerReviewController.create);

/** GET /api/v1/customer/reviews — the authenticated customer's own reviews. */
router.get("/", validate(customerReviewListQuerySchema, "query"), customerReviewController.list);

export { router as customerReviewsRouter };
