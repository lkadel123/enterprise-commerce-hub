import { Types } from "mongoose";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import {
  SupportConversationModel,
  type ISupportConversation,
} from "./support-conversation.model.js";
import type {
  CreateSupportConversationInput,
  SupportConversationListParams,
} from "./support-conversation.types.js";

/** Repository-level create input: `customerId` is required here (resolved server-side). */
export type CreateSupportConversationRecord = CreateSupportConversationInput & {
  customerId: string;
};

export interface SupportConversationListResult {
  items: ISupportConversation[];
  meta: PaginationMeta;
}

export const supportConversationRepository = {
  /** Customer-scoped: list conversations owned by a customer. */
  async listByCustomer(
    customerId: string,
    params: SupportConversationListParams,
  ): Promise<SupportConversationListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params, 20, 100);

    const filter: Record<string, unknown> = { customerId: new Types.ObjectId(customerId) };
    if (params.status) filter.status = params.status;
    if (params.priority) filter.priority = params.priority;
    if (params.category) filter.category = params.category;
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ subject: { $regex: regex } }];
    }

    const sort = parseSort(params.sort, [
      "lastMessageAt",
      "createdAt",
      "updatedAt",
      "priority",
      "status",
    ]);
    const effectiveSort = Object.keys(sort).length > 0 ? sort : { lastMessageAt: -1 as const };

    const [items, total] = await Promise.all([
      SupportConversationModel.find(filter)
        .sort(effectiveSort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      SupportConversationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as ISupportConversation[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  /** Admin-scoped: list all conversations with optional filters. */
  async listAll(params: SupportConversationListParams): Promise<SupportConversationListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params, 20, 100);

    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.priority) filter.priority = params.priority;
    if (params.category) filter.category = params.category;
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ subject: { $regex: regex } }];
    }

    const sort = parseSort(params.sort, [
      "lastMessageAt",
      "createdAt",
      "updatedAt",
      "priority",
      "status",
    ]);
    const effectiveSort = Object.keys(sort).length > 0 ? sort : { lastMessageAt: -1 as const };

    const [items, total] = await Promise.all([
      SupportConversationModel.find(filter)
        .sort(effectiveSort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      SupportConversationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as ISupportConversation[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  /** Ownership-scoped: find a conversation by id for a specific customer. */
  async findByIdForCustomer(id: string, customerId: string): Promise<ISupportConversation | null> {
    return (await SupportConversationModel.findOne({
      _id: new Types.ObjectId(id),
      customerId: new Types.ObjectId(customerId),
    })
      .lean()
      .exec()) as unknown as ISupportConversation | null;
  },

  async findById(id: string): Promise<ISupportConversation | null> {
    return (await SupportConversationModel.findById(id)
      .lean()
      .exec()) as unknown as ISupportConversation | null;
  },

  async create(data: CreateSupportConversationRecord): Promise<ISupportConversation> {
    const doc = await SupportConversationModel.create({
      customerId: new Types.ObjectId(data.customerId),
      subject: data.subject,
      priority: data.priority ?? "normal",
      category: data.category ?? null,
      relatedOrderId: data.relatedOrderId ? new Types.ObjectId(data.relatedOrderId) : null,
      status: "open",
    });
    return doc.toObject() as unknown as ISupportConversation;
  },

  async updateStatus(id: string, status: string): Promise<ISupportConversation | null> {
    return (await SupportConversationModel.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true, runValidators: true },
    )
      .lean()
      .exec()) as unknown as ISupportConversation | null;
  },

  async update(
    id: string,
    patch: Partial<{
      subject: string;
      priority: string;
      category: string | null;
      relatedOrderId: Types.ObjectId | null;
      status: string;
    }>,
  ): Promise<ISupportConversation | null> {
    return (await SupportConversationModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, runValidators: true },
    )
      .lean()
      .exec()) as unknown as ISupportConversation | null;
  },

  async touchLastMessage(id: string): Promise<void> {
    await SupportConversationModel.updateOne(
      { _id: id },
      { $set: { lastMessageAt: new Date() } },
    ).exec();
  },

  async deleteById(id: string): Promise<ISupportConversation | null> {
    return (await SupportConversationModel.findByIdAndDelete(id)
      .lean()
      .exec()) as unknown as ISupportConversation | null;
  },
};
