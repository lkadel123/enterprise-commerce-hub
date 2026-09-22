import { Types } from "mongoose";
import { notFound, badRequest } from "../../utils/ApiError.js";
import { customerAuthRepository } from "../customer-auth/customer-auth.repository.js";
import { ensureCrmCustomer } from "../customer-orders/customer-order.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { supportConversationRepository } from "./support-conversation.repository.js";
import { supportMessageRepository } from "./support-message.repository.js";
import type {
  CreateSupportConversationInput,
  SupportConversationDto,
  SupportConversationListParams,
} from "./support-conversation.types.js";
import type { ISupportConversation } from "./support-conversation.model.js";
import type { SupportMessageDto } from "./support-message.types.js";
import type { ISupportMessage } from "./support-message.model.js";

function toDto(conv: ISupportConversation): SupportConversationDto {
  return {
    id: conv._id.toString(),
    subject: conv.subject,
    status: conv.status,
    priority: conv.priority,
    category: conv.category ?? null,
    relatedOrderId: conv.relatedOrderId ? conv.relatedOrderId.toString() : null,
    lastMessageAt: new Date(conv.lastMessageAt).toISOString(),
    createdAt: new Date(conv.createdAt).toISOString(),
    updatedAt: new Date(conv.updatedAt).toISOString(),
  };
}

function messageToDto(msg: ISupportMessage): SupportMessageDto {
  return {
    id: msg._id.toString(),
    conversationId: msg.conversationId.toString(),
    senderType: msg.senderType,
    message: msg.message,
    read: msg.read,
    readAt: msg.readAt ? new Date(msg.readAt).toISOString() : null,
    createdAt: new Date(msg.createdAt).toISOString(),
    updatedAt: new Date(msg.updatedAt).toISOString(),
  };
}

export interface ConversationWithMessagesDto extends SupportConversationDto {
  messages: SupportMessageDto[];
}

export const supportConversationService = {
  /**
   * Customer creates a new support conversation.
   */
  async createConversation(
    customerAccountId: string,
    input: CreateSupportConversationInput,
  ): Promise<ConversationWithMessagesDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);

    const created = await supportConversationRepository.create({
      customerId: crmCustomerId,
      subject: input.subject,
      priority: input.priority,
      category: input.category,
      relatedOrderId: input.relatedOrderId,
      initialMessage: input.initialMessage,
    });

    await supportMessageRepository.create({
      conversationId: created._id.toString(),
      senderType: "customer",
      senderId: crmCustomerId,
      message: input.initialMessage,
    });

    await supportConversationRepository.touchLastMessage(created._id.toString());

    return this.getConversationForCustomer(customerAccountId, created._id.toString());
  },

  /** Customer lists their own conversations. */
  async listCustomerConversations(
    customerAccountId: string,
    params: SupportConversationListParams,
  ) {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const { items, meta } = await supportConversationRepository.listByCustomer(
      crmCustomerId,
      params,
    );
    return {
      items: items.map((conv) => toDto(conv)),
      meta,
    };
  },

  /** Admin lists all conversations. */
  async listAllConversations(params: SupportConversationListParams) {
    const { items, meta } = await supportConversationRepository.listAll(params);
    return {
      items: items.map((conv) => toDto(conv)),
      meta,
    };
  },

  /** Customer views a conversation (with its messages) — ownership-scoped. */
  async getConversationForCustomer(
    customerAccountId: string,
    conversationId: string,
  ): Promise<ConversationWithMessagesDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const conv = await supportConversationRepository.findByIdForCustomer(
      conversationId,
      crmCustomerId,
    );
    if (!conv) throw notFound("Conversation not found.");

    await supportMessageRepository.markAllReadForRecipient(conversationId, "customer");

    const { items: messages } = await supportMessageRepository.listByConversation(conversationId, {
      page: 1,
      pageSize: 100,
    });

    return {
      ...toDto(conv),
      messages: messages.map((m) => messageToDto(m)),
    };
  },

  /** Admin views any conversation (with its messages). */
  async getConversationAdmin(conversationId: string): Promise<ConversationWithMessagesDto> {
    const conv = await supportConversationRepository.findById(conversationId);
    if (!conv) throw notFound("Conversation not found.");

    const { items: messages } = await supportMessageRepository.listByConversation(conversationId, {
      page: 1,
      pageSize: 100,
    });

    return {
      ...toDto(conv),
      messages: messages.map((m) => messageToDto(m)),
    };
  },

  /** Customer replies to a conversation. */
  async addCustomerMessage(
    customerAccountId: string,
    conversationId: string,
    message: string,
  ): Promise<ConversationWithMessagesDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);

    const conv = await supportConversationRepository.findByIdForCustomer(
      conversationId,
      crmCustomerId,
    );
    if (!conv) throw notFound("Conversation not found.");

    await supportMessageRepository.create({
      conversationId,
      senderType: "customer",
      senderId: crmCustomerId,
      message,
    });

    await supportConversationRepository.touchLastMessage(conversationId);

    if (conv.status === "resolved" || conv.status === "closed") {
      await supportConversationRepository.updateStatus(conversationId, "open");
    }

    return this.getConversationForCustomer(customerAccountId, conversationId);
  },

  /** Customer marks their conversation (all delivered messages) as read — ownership-scoped. */
  async markConversationReadForCustomer(
    customerAccountId: string,
    conversationId: string,
  ): Promise<ConversationWithMessagesDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const conv = await supportConversationRepository.findByIdForCustomer(
      conversationId,
      crmCustomerId,
    );
    if (!conv) throw notFound("Conversation not found.");

    await supportMessageRepository.markAllReadForRecipient(conversationId, "customer");

    return this.getConversationForCustomer(customerAccountId, conversationId);
  },

  /** Admin/agent sends a message as an agent. */
  async addAgentMessage(
    userId: string,
    conversationId: string,
    message: string,
  ): Promise<ConversationWithMessagesDto> {
    const conv = await supportConversationRepository.findById(conversationId);
    if (!conv) throw notFound("Conversation not found.");

    await supportMessageRepository.create({
      conversationId,
      senderType: "agent",
      senderId: userId,
      message,
    });

    await supportConversationRepository.touchLastMessage(conversationId);

    try {
      // Customer notifications are keyed by CustomerAccount id; conv.customerId
      // is the CRM Customer id, so resolve the linked account first.
      let accountId: string | null = null;
      if (conv.customerId) {
        accountId = await customerAuthRepository.findAccountIdByCrmCustomerId(
          conv.customerId.toString(),
        );
      }
      if (accountId) {
        await notificationService.notifyCustomer(
          accountId,
          "support",
          `Agent replied to your conversation: ${conv.subject}`,
          {
            message,
            entityType: "support-conversation",
            entityId: conversationId,
            actionUrl: `/support/conversations/${conversationId}`,
            metadata: { conversationId },
          },
        );
      }
    } catch {
      /* non-fatal */
    }

    return this.getConversationAdmin(conversationId);
  },

  /** Customer updates status (e.g., reopen). */
  async updateStatusForCustomer(
    customerAccountId: string,
    conversationId: string,
    status: string,
  ): Promise<ConversationWithMessagesDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const conv = await supportConversationRepository.findByIdForCustomer(
      conversationId,
      crmCustomerId,
    );
    if (!conv) throw notFound("Conversation not found.");

    const allowedTransitions: Record<string, string[]> = {
      open: ["in_progress", "resolved"],
      in_progress: ["resolved", "closed"],
      resolved: ["open"],
      closed: [],
    };
    const currentStatus = conv.status;
    const allowed = allowedTransitions[currentStatus] ?? [];
    if (!allowed.includes(status)) {
      throw badRequest(`Cannot transition conversation from "${currentStatus}" to "${status}".`);
    }

    await supportConversationRepository.updateStatus(conversationId, status);
    return this.getConversationForCustomer(customerAccountId, conversationId);
  },

  /** Admin updates conversation status. */
  async updateStatusForAdmin(
    conversationId: string,
    status: string,
  ): Promise<ConversationWithMessagesDto> {
    const conv = await supportConversationRepository.findById(conversationId);
    if (!conv) throw notFound("Conversation not found.");

    await supportConversationRepository.updateStatus(conversationId, status);
    return this.getConversationAdmin(conversationId);
  },

  /** Admin updates conversation metadata. */
  async updateForAdmin(
    conversationId: string,
    patch: Partial<{
      subject: string;
      priority: string;
      category: string | null;
      relatedOrderId: Types.ObjectId | null;
      status: string;
    }>,
  ): Promise<ConversationWithMessagesDto> {
    const updated = await supportConversationRepository.update(conversationId, patch);
    if (!updated) throw notFound("Conversation not found.");
    return this.getConversationAdmin(updated._id.toString());
  },

  /** Customer deletes a conversation (and all its messages). */
  async deleteForCustomer(customerAccountId: string, conversationId: string): Promise<boolean> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const conv = await supportConversationRepository.findByIdForCustomer(
      conversationId,
      crmCustomerId,
    );
    if (!conv) throw notFound("Conversation not found.");

    await supportMessageRepository.deleteByConversation(conversationId);
    const result = await supportConversationRepository.deleteById(conversationId);
    return result !== null;
  },

  /** Admin deletes any conversation (and all its messages). */
  async deleteForAdmin(conversationId: string): Promise<boolean> {
    const conv = await supportConversationRepository.findById(conversationId);
    if (!conv) throw notFound("Conversation not found.");

    await supportMessageRepository.deleteByConversation(conversationId);
    const result = await supportConversationRepository.deleteById(conversationId);
    return result !== null;
  },
};
