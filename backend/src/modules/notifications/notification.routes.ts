import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { notificationController } from "./notification.controller.js";
import {
  createNotificationSchema,
  notificationListQuerySchema,
  notificationParamsSchema,
} from "./notification.validator.js";

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// List user's notifications
router.get(
  "/",
  requirePermission("administration", "view"),
  validate(notificationListQuerySchema, "query"),
  notificationController.list,
);

// Get unread count
router.get(
  "/unread-count",
  requirePermission("administration", "view"),
  notificationController.unreadCount,
);

// Create a notification (admin action)
router.post(
  "/",
  requirePermission("administration", "create"),
  validate(createNotificationSchema),
  notificationController.create,
);

// Mark one notification as read
router.patch(
  "/:id/read",
  requirePermission("administration", "edit"),
  validate(notificationParamsSchema, "params"),
  notificationController.markAsRead,
);

// Mark all notifications as read
router.patch(
  "/read-all",
  requirePermission("administration", "edit"),
  notificationController.markAllAsRead,
);

// This dynamic route is registered after static paths such as /read-all.
router.get(
  "/:id",
  requirePermission("administration", "view"),
  validate(notificationParamsSchema, "params"),
  notificationController.getById,
);

// Delete single notification
router.delete(
  "/:id",
  requirePermission("administration", "delete"),
  validate(notificationParamsSchema, "params"),
  notificationController.remove,
);

export { router as notificationsRouter };
