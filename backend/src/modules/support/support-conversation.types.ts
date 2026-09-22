import type { ISupportConversation } from "./support-conversation.model.js";

/**
 * Input for creating a new support conversation.
 *
 * `customerId` is intentionally NOT part of this shape: it is always resolved
 * server-side from the authenticated customer session (req.customer via
 * ensureCrmCustomer). A client-supplied customer id is never trusted.
 */
export interface CreateSupportConversationInput {
  subject: string;
  priority?: "low" | "normal" | "high" | "urgent";
  category?: string;
  relatedOrderId?: string;
  initialMessage: string;
}

export interface SupportConversationDto {
  id: string;
  subject: string;
  status: ISupportConversation["status"];
  priority: ISupportConversation["priority"];
  category: string | null;
  relatedOrderId: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportConversationListParams {
  status?: string;
  priority?: string;
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
