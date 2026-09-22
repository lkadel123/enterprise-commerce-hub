import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { supportConversationService } from "./support-conversation.service.js";
import type { SupportConversationListParams } from "./support-conversation.types.js";
import type { ConversationWithMessagesDto } from "./support-conversation.service.js";

/**
 * Customer support conversation controller.
 * All customer handlers resolve identity from req.customer (CustomerAccount)
 * and enforce ownership at the service/repository layer.
 */
export const supportConversationController = {
  // ---- Customer-facing handlers ----

  customerCreate: asyncHandler(async (req, res) => {
    const dto: ConversationWithMessagesDto = await supportConversationService.createConversation(
      req.customer!.id,
      {
        subject: req.body.subject,
        priority: req.body.priority,
        category: req.body.category,
        relatedOrderId: req.body.relatedOrderId,
        initialMessage: req.body.initialMessage,
      },
    );
    sendCreated(res, dto, "Support conversation created.");
  }),

  customerList: asyncHandler(async (req, res) => {
    const params = req.query as unknown as SupportConversationListParams;
    const result = await supportConversationService.listCustomerConversations(
      req.customer!.id,
      params,
    );
    sendPaginated(res, result.items, result.meta);
  }),

  customerGetById: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.getConversationForCustomer(
      req.customer!.id,
      req.params.id as string,
    );
    sendSuccess(res, dto);
  }),

  customerUpdateStatus: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.updateStatusForCustomer(
      req.customer!.id,
      req.params.id as string,
      req.body.status,
    );
    sendSuccess(res, dto, "Conversation status updated.");
  }),

  customerDelete: asyncHandler(async (req, res) => {
    const deleted = await supportConversationService.deleteForCustomer(
      req.customer!.id,
      req.params.id as string,
    );
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Conversation not found." },
      });
      return;
    }
    sendSuccess(res, { id: req.params.id }, "Conversation deleted.");
  }),

  customerAddMessage: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.addCustomerMessage(
      req.customer!.id,
      req.params.id as string,
      req.body.message,
    );
    sendSuccess(res, dto, "Message sent.", 201);
  }),

  customerListMessages: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.getConversationForCustomer(
      req.customer!.id,
      req.params.id as string,
    );
    sendSuccess(res, dto);
  }),

  customerMarkRead: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.markConversationReadForCustomer(
      req.customer!.id,
      req.params.id as string,
    );
    sendSuccess(res, dto, "Conversation marked as read.");
  }),

  // ---- Admin-facing handlers ----

  adminList: asyncHandler(async (req, res) => {
    const params = req.query as unknown as SupportConversationListParams;
    const result = await supportConversationService.listAllConversations(params);
    sendPaginated(res, result.items, result.meta);
  }),

  adminGetById: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.getConversationAdmin(req.params.id as string);
    sendSuccess(res, dto);
  }),

  adminUpdateStatus: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.updateStatusForAdmin(
      req.params.id as string,
      req.body.status,
    );
    sendSuccess(res, dto, "Conversation status updated.");
  }),

  adminUpdate: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.updateForAdmin(req.params.id as string, {
      subject: req.body.subject,
      priority: req.body.priority,
      category: req.body.category,
      relatedOrderId: req.body.relatedOrderId,
      status: req.body.status,
    });
    sendSuccess(res, dto, "Conversation updated.");
  }),

  adminAddAgentMessage: asyncHandler(async (req, res) => {
    const dto = await supportConversationService.addAgentMessage(
      req.user!.id,
      req.params.id as string,
      req.body.message,
    );
    sendSuccess(res, dto, "Message sent.", 201);
  }),

  adminDelete: asyncHandler(async (req, res) => {
    const deleted = await supportConversationService.deleteForAdmin(req.params.id as string);
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Conversation not found." },
      });
      return;
    }
    sendSuccess(res, { id: req.params.id }, "Conversation deleted.");
  }),
};
