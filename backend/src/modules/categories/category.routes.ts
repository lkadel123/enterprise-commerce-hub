import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { categoryController } from "./category.controller.js";
import {
  categoryListQuerySchema,
  categoryParamsSchema,
  createCategorySchema,
  updateCategorySchema,
} from "./category.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("catalog", "view"),
  validate(categoryListQuerySchema, "query"),
  categoryController.list,
);
router.get(
  "/:id",
  requirePermission("catalog", "view"),
  validate(categoryParamsSchema, "params"),
  categoryController.getById,
);
router.post(
  "/",
  requirePermission("catalog", "create"),
  validate(createCategorySchema),
  categoryController.create,
);
router.put(
  "/:id",
  requirePermission("catalog", "edit"),
  validate(categoryParamsSchema, "params"),
  validate(updateCategorySchema),
  categoryController.update,
);
router.delete(
  "/:id",
  requirePermission("catalog", "delete"),
  validate(categoryParamsSchema, "params"),
  categoryController.remove,
);

export { router as categoriesRouter };
