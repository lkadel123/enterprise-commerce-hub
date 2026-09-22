import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { couponController } from "./coupon.controller.js";
import {
  couponListQuerySchema,
  couponParamsSchema,
  createCouponSchema,
  updateCouponSchema,
} from "./coupon.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("marketing", "view"),
  validate(couponListQuerySchema, "query"),
  couponController.list,
);
router.post(
  "/",
  requirePermission("marketing", "create"),
  validate(createCouponSchema),
  couponController.create,
);
router.get(
  "/:id",
  requirePermission("marketing", "view"),
  validate(couponParamsSchema, "params"),
  couponController.getById,
);
router.put(
  "/:id",
  requirePermission("marketing", "edit"),
  validate(couponParamsSchema, "params"),
  validate(updateCouponSchema),
  couponController.update,
);
router.delete(
  "/:id",
  requirePermission("marketing", "delete"),
  validate(couponParamsSchema, "params"),
  couponController.remove,
);

export { router as couponsRouter };
