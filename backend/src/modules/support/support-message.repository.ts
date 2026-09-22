import { Types } from "mongoose";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { SupportMessageModel, type ISupportMessage } from "./support-message.model.js";
import type {
  CreateSupportMessageInput,
  SupportMessageListParams,
} from "./support-message.types.js";

export interface SupportMessageListResult {
  items: ISupportMessage[];
  meta: PaginationMeta;
}

export const supportMessageRepository = {
  async listByConversation(
    conversationId: string,
    params: SupportMessageListParams,
  ): Promise<SupportMessageListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params, 50, 100);

    const filter: Record<string, unknown> = {
      conversationId: new Types.ObjectId(conversationId),
    };

    const sort = parseSort(params.sort, ["createdAt"]);
    const effectiveSort = Object.keys(sort).length > 0 ? sort : { createdAt: 1 as const };

    const [items, total] = await Promise.all([
      SupportMessageModel.find(filter).sort(effectiveSort).skip(skip).limit(limit).lean().exec(),
      SupportMessageModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as ISupportMessage[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async create(data: CreateSupportMessageInput): Promise<ISupportMessage> {
    const doc = await SupportMessageModel.create({
      conversationId: new Types.ObjectId(data.conversationId),
      senderType: data.senderType,
      senderId: data.senderId ? new Types.ObjectId(data.senderId) : null,
      message: data.message,
      read: data.senderType === "agent" || data.senderType === "system" ? false : true,
      readAt: data.senderType === "agent" || data.senderType === "system" ? null : new Date(),
    });
    return doc.toObject() as unknown as ISupportMessage;
  },

  /** Mark all messages in a conversation as read for a given recipient type. */
  async markAllReadForRecipient(
    conversationId: string,
    senderType: "customer" | "agent" | "system",
  ): Promise<number> {
    const result = await SupportMessageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        senderType: { $ne: senderType },
        read: false,
      },
      { $set: { read: true, readAt: new Date() } },
    ).exec();
    return result.modifiedCount;
  },

  async deleteByConversation(conversationId: string): Promise<number> {
    const result = await SupportMessageModel.deleteMany({
      conversationId: new Types.ObjectId(conversationId),
    }).exec();
    return result.deletedCount;
  },
};
