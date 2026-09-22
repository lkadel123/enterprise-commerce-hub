export const MESSAGE_TYPES = [
  "general",
  "order",
  "customer",
  "product",
  "inventory",
  "system",
  "support",
] as const;
export const MESSAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number];

export interface MessageParty {
  id: string;
  name: string;
  email: string;
}
export interface MessageDto {
  id: string;
  sender: MessageParty;
  recipient: MessageParty;
  subject: string;
  body: string;
  type: MessageType;
  priority: MessagePriority;
  isRead: boolean;
  readAt: string | null;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CreateMessageInput {
  recipientId: string;
  subject: string;
  body: string;
  type?: MessageType;
  priority?: MessagePriority;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}
