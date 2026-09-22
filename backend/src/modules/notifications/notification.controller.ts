import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { notificationService } from "./notification.service.js";
import type { NotificationListParams } from "./notification.repository.js";

export const notificationController = {
  list: asyncHandler(async (req, res) => {
    const params = req.query as unknown as NotificationListParams;
    const result = await notificationService.list(req.user!.id, "admin", params);
    sendPaginated(res, result.items, result.meta);
  }),

  getById: asyncHandler(async (req, res) => {
    const notification = await notificationService.getById(
      req.params.id as string,
      req.user!.id,
      "admin",
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
    const result = await notificationService.getUnreadCount(req.user!.id, "admin");
    sendSuccess(res, result);
  }),

  markAsRead: asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(
      req.params.id as string,
      req.user!.id,
      "admin",
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
    const count = await notificationService.markAllAsRead(req.user!.id, "admin");
    sendSuccess(res, { count }, `${count} notifications marked as read.`);
  }),

  remove: asyncHandler(async (req, res) => {
    const deleted = await notificationService.remove(
      req.params.id as string,
      req.user!.id,
      "admin",
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
    const notification = await notificationService.create({
      recipientId: req.body.recipientId,
      recipientType: req.body.recipientType ?? "admin",
      type: req.body.type,
      title: req.body.title,
      message: req.body.message,
      priority: req.body.priority,
      entityType: req.body.entityType,
      entityId: req.body.entityId,
      actionUrl: req.body.actionUrl,
      metadata: req.body.metadata,
    });
    sendCreated(res, notification, "Notification created.");
  }),
};
