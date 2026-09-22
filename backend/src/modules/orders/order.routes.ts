import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { orderController } from "./order.controller.js";
import {
  cancelOrderSchema,
  createOrderSchema,
  orderListQuerySchema,
  orderParamsSchema,
  refundOrderSchema,
  setOrderPaymentSchema,
  setOrderStatusSchema,
} from "./order.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("orders", "view"),
  validate(orderListQuerySchema, "query"),
  orderController.list,
);
router.post(
  "/",
  requirePermission("orders", "create"),
  validate(createOrderSchema),
  orderController.create,
);
router.get(
  "/:id",
  requirePermission("orders", "view"),
  validate(orderParamsSchema, "params"),
  orderController.getById,
);
router.patch(
  "/:id/status",
  requirePermission("orders", "edit"),
  validate(orderParamsSchema, "params"),
  validate(setOrderStatusSchema),
  orderController.setStatus,
);
router.patch(
  "/:id/payment",
  requirePermission("orders", "edit"),
  validate(orderParamsSchema, "params"),
  validate(setOrderPaymentSchema),
  orderController.setPayment,
);
router.post(
  "/expire-pending",
  requirePermission("orders", "edit"),
  orderController.expirePending,
);
router.post(
  "/:id/cancel",
  requirePermission("orders", "edit"),
  validate(orderParamsSchema, "params"),
  validate(cancelOrderSchema),
  orderController.cancel,
);
router.post(
  "/:id/refund",
  requirePermission("orders", "edit"),
  validate(orderParamsSchema, "params"),
  validate(refundOrderSchema),
  orderController.refund,
);

export { router as ordersRouter };
