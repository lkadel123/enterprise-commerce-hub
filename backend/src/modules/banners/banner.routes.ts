import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { bannerController } from "./banner.controller.js";
import {
  bannerListQuerySchema,
  bannerParamsSchema,
  createBannerSchema,
  updateBannerSchema,
} from "./banner.validator.js";

const router = Router();
router.use(authenticate);
router.get(
  "/",
  requirePermission("marketing", "view"),
  validate(bannerListQuerySchema, "query"),
  bannerController.list,
);
router.post(
  "/",
  requirePermission("marketing", "create"),
  validate(createBannerSchema),
  bannerController.create,
);
router.get(
  "/:id",
  requirePermission("marketing", "view"),
  validate(bannerParamsSchema, "params"),
  bannerController.getById,
);
router.patch(
  "/:id",
  requirePermission("marketing", "edit"),
  validate(bannerParamsSchema, "params"),
  validate(updateBannerSchema),
  bannerController.update,
);
router.delete(
  "/:id",
  requirePermission("marketing", "delete"),
  validate(bannerParamsSchema, "params"),
  bannerController.remove,
);
export { router as bannersRouter };
