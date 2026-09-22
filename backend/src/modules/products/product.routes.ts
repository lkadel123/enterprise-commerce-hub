import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { productController } from "./product.controller.js";
import {
  createProductSchema,
  productListQuerySchema,
  productParamsSchema,
  setProductStatusSchema,
  updateProductSchema,
} from "./product.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("catalog", "view"),
  validate(productListQuerySchema, "query"),
  productController.list,
);
router.get(
  "/:id",
  requirePermission("catalog", "view"),
  validate(productParamsSchema, "params"),
  productController.getById,
);
router.post(
  "/",
  requirePermission("catalog", "create"),
  validate(createProductSchema),
  productController.create,
);
router.put(
  "/:id",
  requirePermission("catalog", "edit"),
  validate(productParamsSchema, "params"),
  validate(updateProductSchema),
  productController.update,
);
router.patch(
  "/:id/status",
  requirePermission("catalog", "edit"),
  validate(productParamsSchema, "params"),
  validate(setProductStatusSchema),
  productController.setStatus,
);
router.delete(
  "/:id",
  requirePermission("catalog", "delete"),
  validate(productParamsSchema, "params"),
  productController.remove,
);

export { router as productsRouter };
