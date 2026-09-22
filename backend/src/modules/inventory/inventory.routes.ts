import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { inventoryController } from "./inventory.controller.js";
import {
  adjustStockSchema,
  inventoryListQuerySchema,
  inventoryParamsSchema,
} from "./inventory.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("inventory", "view"),
  validate(inventoryListQuerySchema, "query"),
  inventoryController.list,
);
// Static paths registered before "/:id".
router.get("/summary", requirePermission("inventory", "view"), inventoryController.summary);
router.post(
  "/adjust",
  requirePermission("inventory", "edit"),
  validate(adjustStockSchema),
  inventoryController.adjust,
);
router.get(
  "/:id",
  requirePermission("inventory", "view"),
  validate(inventoryParamsSchema, "params"),
  inventoryController.getById,
);

export { router as inventoryRouter };
