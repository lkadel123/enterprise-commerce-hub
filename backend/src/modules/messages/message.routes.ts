import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { messageController } from "./message.controller.js";
import {
  createMessageSchema,
  messageListQuerySchema,
  messageParamsSchema,
} from "./message.validator.js";
const router = Router();
router.use(authenticate);
router.get(
  "/",
  requirePermission("messages", "view"),
  validate(messageListQuerySchema, "query"),
  messageController.list,
);
router.get("/unread-count", requirePermission("messages", "view"), messageController.unreadCount);
router.post(
  "/",
  requirePermission("messages", "create"),
  validate(createMessageSchema),
  messageController.create,
);
router.patch("/read-all", requirePermission("messages", "edit"), messageController.markAllRead);
router.patch(
  "/:id/read",
  requirePermission("messages", "edit"),
  validate(messageParamsSchema, "params"),
  messageController.markRead,
);
router.patch(
  "/:id/unread",
  requirePermission("messages", "edit"),
  validate(messageParamsSchema, "params"),
  messageController.markUnread,
);
router.get(
  "/:id",
  requirePermission("messages", "view"),
  validate(messageParamsSchema, "params"),
  messageController.getById,
);
router.delete(
  "/:id",
  requirePermission("messages", "delete"),
  validate(messageParamsSchema, "params"),
  messageController.remove,
);
export { router as messagesRouter };
