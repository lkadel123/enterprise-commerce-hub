import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { messageService } from "./message.service.js";
import type { MessageListParams } from "./message.repository.js";
export const messageController = {
  list: asyncHandler(async (req, res) => {
    const result = await messageService.list(
      req.user!.id,
      req.query as unknown as MessageListParams,
    );
    sendPaginated(res, result.items, result.meta);
  }),
  getById: asyncHandler(async (req, res) => {
    const message = await messageService.getById(req.params.id as string, req.user!.id);
    if (!message) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Message not found." } });
      return;
    }
    sendSuccess(res, message);
  }),
  create: asyncHandler(async (req, res) =>
    sendCreated(res, await messageService.create(req.user!.id, req.body), "Message sent."),
  ),
  unreadCount: asyncHandler(async (req, res) =>
    sendSuccess(res, await messageService.unreadCount(req.user!.id)),
  ),
  markRead: asyncHandler(async (req, res) => {
    const message = await messageService.markRead(req.params.id as string, req.user!.id, true);
    if (!message) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Message not found." } });
      return;
    }
    sendSuccess(res, message);
  }),
  markUnread: asyncHandler(async (req, res) => {
    const message = await messageService.markRead(req.params.id as string, req.user!.id, false);
    if (!message) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Message not found." } });
      return;
    }
    sendSuccess(res, message);
  }),
  markAllRead: asyncHandler(async (req, res) =>
    sendSuccess(res, { count: await messageService.markAllRead(req.user!.id) }),
  ),
  remove: asyncHandler(async (req, res) => {
    const message = await messageService.remove(req.params.id as string, req.user!.id);
    if (!message) {
      res
        .status(404)
        .json({ success: false, error: { code: "NOT_FOUND", message: "Message not found." } });
      return;
    }
    sendSuccess(res, { id: req.params.id }, "Message deleted.");
  }),
};
