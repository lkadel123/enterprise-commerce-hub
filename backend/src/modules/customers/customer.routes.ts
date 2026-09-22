import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { customerController } from "./customer.controller.js";
import {
  createCustomerSchema,
  customerListQuerySchema,
  customerParamsSchema,
  updateCustomerSchema,
} from "./customer.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("customers", "view"),
  validate(customerListQuerySchema, "query"),
  customerController.list,
);
router.post(
  "/",
  requirePermission("customers", "create"),
  validate(createCustomerSchema),
  customerController.create,
);
router.get(
  "/:id",
  requirePermission("customers", "view"),
  validate(customerParamsSchema, "params"),
  customerController.getById,
);
router.patch(
  "/:id",
  requirePermission("customers", "edit"),
  validate(customerParamsSchema, "params"),
  validate(updateCustomerSchema),
  customerController.update,
);
router.delete(
  "/:id",
  requirePermission("customers", "delete"),
  validate(customerParamsSchema, "params"),
  customerController.remove,
);

export { router as customersRouter };
