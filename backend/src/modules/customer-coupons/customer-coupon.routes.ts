import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter, authActionRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerCouponController } from "./customer-coupon.controller.js";
import {
  customerCouponListQuerySchema,
  validateCouponSchema,
} from "./customer-coupon.validator.js";

/**
 * Customer self-service coupon surface (mounted at /api/v1/customer/coupons).
 *
 * Deliberately separate from the admin /api/v1/coupons surface. All routes
 * require an authenticated customer session. Customer identity is derived
 * exclusively from req.customer (→ CustomerAccount → linked CRM Customer);
 * a client-supplied customer id is never trusted. All coupon eligibility,
 * per-customer usage and amounts are resolved server-side.
 *
 * POST /validate is mutation-sensitive (it can be used to probe many codes),
 * so it gets the stricter authActionRateLimiter in addition to the general
 * apiRateLimiter applied to the whole router.
 */
const router = Router();

router.use(customerAuthenticate);
router.use(apiRateLimiter);

router.post(
  "/validate",
  authActionRateLimiter,
  validate(validateCouponSchema, "body"),
  customerCouponController.validate,
);

router.get("/", validate(customerCouponListQuerySchema, "query"), customerCouponController.list);

export { router as customerCouponsRouter };
