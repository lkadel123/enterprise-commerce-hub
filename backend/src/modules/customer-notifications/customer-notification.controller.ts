import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendPaginated, sendSuccess, sendCreated } from "../../utils/ApiResponse.js";
import { notificationService } from "../notifications/notification.service.js";
import type { NotificationListParams } from "../notifications/notification.repository.js";

/**
 * Customer self-service notification controller.
 *
 * Every handler is scoped to the authenticated customer's account
 * (req.customer.id) and recipientType "customer". A customer can never
 * see or mutate another customer's notifications or any admin notifications.
 */
export const customerNotificationController = {
  list: asyncHandler(async (req, res) => {
    const params = req.query as unknown as NotificationListParams;
    const result = await notificationService.list(req.customer!.id, "customer", params);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const notification = await notificationService.getById(
      req.params.id as string,
      req.customer!.id,
      "customer",
    );
    if (!notification) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Notification not found." },
      });
      return;
    }
    sendSuccess(res, notification);
  }),

  unreadCount: asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadCount(req.customer!.id, "customer");
    sendSuccess(res, result);
  }),

  markAsRead: asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(
      req.params.id as string,
      req.customer!.id,
      "customer",
    );
    if (!notification) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Notification not found." },
      });
      return;
    }
    sendSuccess(res, notification, "Notification marked as read.");
  }),

  markAllAsRead: asyncHandler(async (req, res) => {
    const count = await notificationService.markAllAsRead(req.customer!.id, "customer");
    sendSuccess(res, { count }, `${count} notifications marked as read.`);
  }),

  remove: asyncHandler(async (req, res) => {
    const deleted = await notificationService.remove(
      req.params.id as string,
      req.customer!.id,
      "customer",
    );
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Notification not found." },
      });
      return;
    }
    sendSuccess(res, { id: req.params.id }, "Notification deleted.");
  }),

  create: asyncHandler(async (req, res) => {
    const notification = await notificationService.notifyCustomer(
      req.customer!.id,
      req.body.type,
      req.body.title,
      {
        message: req.body.message,
        priority: req.body.priority,
        entityType: req.body.entityType,
        entityId: req.body.entityId,
        actionUrl: req.body.actionUrl,
        metadata: req.body.metadata,
      },
    );
    sendCreated(res, notification, "Notification created.");
  }),
};
