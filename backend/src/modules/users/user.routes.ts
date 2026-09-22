import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { adminActionRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";
import { userController } from "./user.controller.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamsSchema,
} from "./user.validator.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("administration", "view"),
  validate(listUsersQuerySchema, "query"),
  userController.list,
);
// NOTE: registered before "/:id" so "roles" is not captured as an id.
router.get("/roles", requirePermission("administration", "view"), userController.listRoles);
router.post(
  "/",
  requirePermission("administration", "create"),
  validate(createUserSchema),
  userController.create,
);
router.get(
  "/:id",
  requirePermission("administration", "view"),
  validate(userIdParamsSchema, "params"),
  userController.getById,
);
router.patch(
  "/:id",
  requirePermission("administration", "edit"),
  validate(userIdParamsSchema, "params"),
  validate(updateUserSchema),
  userController.update,
);
router.post(
  "/:id/reset-password",
  adminActionRateLimiter,
  requirePermission("administration", "edit"),
  validate(userIdParamsSchema, "params"),
  validate(resetPasswordSchema),
  userController.resetPassword,
);
router.delete(
  "/:id",
  requirePermission("administration", "delete"),
  validate(userIdParamsSchema, "params"),
  userController.remove,
);

export { router as usersRouter };
