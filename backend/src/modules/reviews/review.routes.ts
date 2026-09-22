import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { reviewController } from "./review.controller.js";
import {
  reviewListQuerySchema,
  reviewParamsSchema,
  updateReviewStatusSchema,
} from "./review.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("catalog", "view"),
  validate(reviewListQuerySchema, "query"),
  reviewController.list,
);
// Static path registered before "/:id".
router.get("/stats", requirePermission("catalog", "view"), reviewController.stats);
router.patch(
  "/:id/status",
  requirePermission("catalog", "edit"),
  validate(reviewParamsSchema, "params"),
  validate(updateReviewStatusSchema),
  reviewController.setStatus,
);
router.delete(
  "/:id",
  requirePermission("catalog", "delete"),
  validate(reviewParamsSchema, "params"),
  reviewController.remove,
);

export { router as reviewsRouter };
