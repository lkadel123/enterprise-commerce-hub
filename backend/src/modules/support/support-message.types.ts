import type { ISupportMessage } from "./support-message.model.js";

export interface CreateSupportMessageInput {
  conversationId: string;
  senderType: "customer" | "agent" | "system";
  senderId?: string;
  message: string;
}

export interface SupportMessageDto {
  id: string;
  conversationId: string;
  senderType: ISupportMessage["senderType"];
  message: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessageListParams {
  page?: number;
  pageSize?: number;
  sort?: string;
}
