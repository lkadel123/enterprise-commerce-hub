import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { brandController } from "./brand.controller.js";
import {
  brandListQuerySchema,
  brandParamsSchema,
  createBrandSchema,
  updateBrandSchema,
} from "./brand.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("catalog", "view"),
  validate(brandListQuerySchema, "query"),
  brandController.list,
);
router.get(
  "/:id",
  requirePermission("catalog", "view"),
  validate(brandParamsSchema, "params"),
  brandController.getById,
);
router.post(
  "/",
  requirePermission("catalog", "create"),
  validate(createBrandSchema),
  brandController.create,
);
router.put(
  "/:id",
  requirePermission("catalog", "edit"),
  validate(brandParamsSchema, "params"),
  validate(updateBrandSchema),
  brandController.update,
);
router.delete(
  "/:id",
  requirePermission("catalog", "delete"),
  validate(brandParamsSchema, "params"),
  brandController.remove,
);

export { router as brandsRouter };
