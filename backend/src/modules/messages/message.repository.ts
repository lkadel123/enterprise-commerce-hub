import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import { MessageModel, type IMessage } from "./message.model.js";
import type { CreateMessageInput } from "./message.types.js";
export interface MessageListParams {
  q?: string;
  status?: "read" | "unread";
  type?: string;
  priority?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
const partySelect = "name email";
export const messageRepository = {
  async list(userId: string, params: MessageListParams) {
    const { page, pageSize, skip, limit } = parsePagination(params, 20, 100);
    const filter: Record<string, unknown> = {
      $or: [{ recipientId: userId }, { senderId: userId }],
    };
    if (params.status) filter.isRead = params.status === "read";
    if (params.type) filter.type = params.type;
    if (params.priority) filter.priority = params.priority;
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$and = [
        { $or: [{ recipientId: userId }, { senderId: userId }] },
        { $or: [{ subject: regex }, { body: regex }] },
      ];
      delete filter.$or;
    }
    const sort = parseSort(params.sort, ["createdAt", "priority", "type", "isRead"]);
    const effectiveSort = Object.keys(sort).length ? sort : { createdAt: -1 as const };
    const [items, total] = await Promise.all([
      MessageModel.find(filter)
        .populate("senderId", partySelect)
        .populate("recipientId", partySelect)
        .sort(effectiveSort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      MessageModel.countDocuments(filter).exec(),
    ]);
    return { items: items as unknown as IMessage[], meta: paginationMeta(total, page, pageSize) };
  },
  async findForUser(id: string, userId: string) {
    return MessageModel.findOne({ _id: id, $or: [{ recipientId: userId }, { senderId: userId }] })
      .populate("senderId", partySelect)
      .populate("recipientId", partySelect)
      .lean()
      .exec() as Promise<IMessage | null>;
  },
  async create(senderId: string, input: CreateMessageInput) {
    const doc = await MessageModel.create({
      senderId,
      recipientId: input.recipientId,
      subject: input.subject,
      body: input.body,
      type: input.type ?? "general",
      priority: input.priority ?? "normal",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actionUrl: input.actionUrl ?? null,
      metadata: input.metadata ?? null,
    });
    return this.findForUser(doc.id, senderId);
  },
  async markRead(id: string, recipientId: string, isRead: boolean) {
    return MessageModel.findOneAndUpdate(
      { _id: id, recipientId },
      { $set: { isRead, readAt: isRead ? new Date() : null } },
      { new: true },
    )
      .populate("senderId", partySelect)
      .populate("recipientId", partySelect)
      .lean()
      .exec() as Promise<IMessage | null>;
  },
  async markAllRead(recipientId: string) {
    const result = await MessageModel.updateMany(
      { recipientId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    ).exec();
    return result.modifiedCount;
  },
  async remove(id: string, userId: string) {
    return MessageModel.findOneAndDelete({
      _id: id,
      $or: [{ recipientId: userId }, { senderId: userId }],
    })
      .lean()
      .exec() as Promise<IMessage | null>;
  },
  countUnread(recipientId: string) {
    return MessageModel.countDocuments({ recipientId, isRead: false }).exec();
  },
};
