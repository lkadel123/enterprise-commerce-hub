import { Router } from "express";

import { customerAuthenticate } from "../../middleware/customerAuthenticate.js";
import { apiRateLimiter } from "../../middleware/rateLimiter.js";
import { validate } from "../../middleware/validate.js";

import { customerNotificationController } from "./customer-notification.controller.js";
import {
  customerNotificationParamsSchema,
  customerNotificationListQuerySchema,
} from "./customer-notification.validator.js";

/**
 * Customer self-service notifications surface
 * (mounted at /api/v1/customer/notifications).
 *
 * All routes require an authenticated customer session. Notifications are
 * scoped to the authenticated customer's account (req.customer.id) with
 * recipientType "customer" — a customer can never read or mutate another
 * customer's notifications, nor any admin notifications.
 */
const router = Router();

router.use(customerAuthenticate);
router.use(apiRateLimiter);

/** GET /api/v1/customer/notifications — the authenticated customer's notifications. */
router.get(
  "/",
  validate(customerNotificationListQuerySchema, "query"),
  customerNotificationController.list,
);

/** GET /api/v1/customer/notifications/unread-count — unread count for the customer. */
router.get("/unread-count", customerNotificationController.unreadCount);

/** GET /api/v1/customer/notifications/:id — a single notification (owner-scoped). */
router.get(
  "/:id",
  validate(customerNotificationParamsSchema, "params"),
  customerNotificationController.getById,
);

/** PATCH /api/v1/customer/notifications/:id/read — mark a notification as read. */
router.patch(
  "/:id/read",
  validate(customerNotificationParamsSchema, "params"),
  customerNotificationController.markAsRead,
);

/** POST /api/v1/customer/notifications/read-all — mark all as read. */
router.post("/read-all", customerNotificationController.markAllAsRead);

/** DELETE /api/v1/customer/notifications/:id — delete a notification. */
router.delete(
  "/:id",
  validate(customerNotificationParamsSchema, "params"),
  customerNotificationController.remove,
);

export { router as customerNotificationsRouter };
