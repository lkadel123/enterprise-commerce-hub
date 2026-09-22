import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { reportController } from "./report.controller.js";
import { reportQuerySchema } from "./report.validator.js";

const router = Router();

router.use(authenticate);

router.get("/overview", requirePermission("reports", "view"), reportController.overview);
router.get(
  "/revenue",
  requirePermission("reports", "view"),
  validate(reportQuerySchema, "query"),
  reportController.revenue,
);
router.get(
  "/categories",
  requirePermission("reports", "view"),
  validate(reportQuerySchema, "query"),
  reportController.categories,
);
router.get(
  "/payment-methods",
  requirePermission("reports", "view"),
  validate(reportQuerySchema, "query"),
  reportController.paymentMethods,
);
router.get(
  "/regions",
  requirePermission("reports", "view"),
  validate(reportQuerySchema, "query"),
  reportController.regions,
);
router.get(
  "/top-products",
  requirePermission("reports", "view"),
  validate(reportQuerySchema, "query"),
  reportController.topProducts,
);

export { router as reportsRouter };
