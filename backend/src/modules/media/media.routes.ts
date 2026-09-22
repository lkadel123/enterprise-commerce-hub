import { Router } from "express";
import multer from "multer";
import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { badRequest } from "../../utils/ApiError.js";
import { mediaController } from "./media.controller.js";
import { mediaListQuerySchema, mediaParamsSchema, updateMediaSchema } from "./media.validator.js";
import { IMAGE_MIME_TYPES } from "./media.model.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MEDIA_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) =>
    callback(null, (IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)),
});
const router = Router();
router.use(authenticate);
router.get(
  "/",
  requirePermission("marketing", "view"),
  validate(mediaListQuerySchema, "query"),
  mediaController.list,
);
router.post(
  "/",
  requirePermission("marketing", "create"),
  (req, res, next) =>
    upload.single("file")(req, res, (error) =>
      next(error ?? (!req.file ? badRequest("An image file is required.") : undefined)),
    ),
  mediaController.create,
);
router.get(
  "/:id",
  requirePermission("marketing", "view"),
  validate(mediaParamsSchema, "params"),
  mediaController.getById,
);
router.patch(
  "/:id",
  requirePermission("marketing", "edit"),
  validate(mediaParamsSchema, "params"),
  validate(updateMediaSchema),
  mediaController.update,
);
router.delete(
  "/:id",
  requirePermission("marketing", "delete"),
  validate(mediaParamsSchema, "params"),
  mediaController.remove,
);
export { router as mediaRouter };
