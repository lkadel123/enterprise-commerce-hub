import { notFound } from "../../utils/ApiError.js";
import { userRepository } from "../users/user.repository.js";
import { messageRepository, type MessageListParams } from "./message.repository.js";
import type { CreateMessageInput, MessageDto, MessageParty } from "./message.types.js";
import type { IMessage } from "./message.model.js";

type PopulatedParty = { _id: { toString(): string }; name: string; email: string };
function party(value: unknown): MessageParty {
  const user = value as PopulatedParty;
  return { id: user._id.toString(), name: user.name, email: user.email };
}
function dto(message: IMessage): MessageDto {
  const populated = message as IMessage & { senderId: PopulatedParty; recipientId: PopulatedParty };
  return {
    id: message._id.toString(),
    sender: party(populated.senderId),
    recipient: party(populated.recipientId),
    subject: message.subject,
    body: message.body,
    type: message.type,
    priority: message.priority,
    isRead: message.isRead,
    readAt: message.readAt?.toISOString() ?? null,
    entityType: message.entityType,
    entityId: message.entityId,
    actionUrl: message.actionUrl,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}
export const messageService = {
  async list(userId: string, params: MessageListParams) {
    const result = await messageRepository.list(userId, params);
    return { items: result.items.map(dto), meta: result.meta };
  },
  async getById(id: string, userId: string) {
    const message = await messageRepository.findForUser(id, userId);
    return message ? dto(message) : null;
  },
  async create(senderId: string, input: CreateMessageInput) {
    const recipient = await userRepository.findById(input.recipientId);
    if (!recipient || recipient.status !== "Active") throw notFound("Active recipient not found.");
    const message = await messageRepository.create(senderId, input);
    if (!message) throw new Error("Message creation failed.");
    return dto(message);
  },
  async markRead(id: string, recipientId: string, isRead: boolean) {
    const message = await messageRepository.markRead(id, recipientId, isRead);
    return message ? dto(message) : null;
  },
  markAllRead(recipientId: string) {
    return messageRepository.markAllRead(recipientId);
  },
  remove(id: string, userId: string) {
    return messageRepository.remove(id, userId);
  },
  async unreadCount(recipientId: string) {
    return { count: await messageRepository.countUnread(recipientId) };
  },
};
