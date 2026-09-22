import { Types } from "mongoose";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { NotificationModel, type INotification } from "./notification.model.js";
import type { CreateNotificationInput } from "./notification.types.js";

/**
 * Business ordering for notification priority. Lexical string sorting is wrong
 * (e.g. "high" < "low" < "normal"), so we sort by an explicit rank.
 */
const PRIORITY_RANK: Record<string, number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

export interface NotificationListParams {
  read?: boolean;
  type?: string;
  priority?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface NotificationListResult {
  items: INotification[];
  meta: PaginationMeta;
}

export const notificationRepository = {
  async list(
    recipientId: string,
    recipientType: "admin" | "customer",
    params: NotificationListParams,
  ): Promise<NotificationListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params, 20, 100);

    const filter: Record<string, unknown> = { recipientId, recipientType };
    if (params.read !== undefined) filter.read = params.read;
    if (params.type) filter.type = params.type;
    if (params.priority) filter.priority = params.priority;
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ title: { $regex: regex } }, { message: { $regex: regex } }];
    }

    const sort = parseSort(params.sort, ["createdAt", "priority", "type", "read"]);

    const effectiveSort = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };

    // Priority must be ordered by business rank, not lexically. Use an
    // aggregation that projects an explicit rank and sorts by it.
    if (sort.priority) {
      const direction = sort.priority === 1 ? 1 : -1;
      const priorityBranches = Object.entries(PRIORITY_RANK).map(([value, rank]) => ({
        case: { $eq: ["$priority", value] },
        then: rank,
      }));

      const [items, total] = await Promise.all([
        NotificationModel.aggregate<INotification>([
          { $match: { ...filter, recipientId: new Types.ObjectId(recipientId) } },
          {
            $addFields: {
              __priorityRank: {
                $switch: { branches: priorityBranches, default: 99 },
              },
            },
          },
          { $sort: { __priorityRank: direction } },
          { $skip: skip },
          { $limit: limit },
        ]).exec(),
        NotificationModel.countDocuments(filter).exec(),
      ]);

      return {
        items: items as unknown as INotification[],
        meta: paginationMeta(total, page, pageSize),
      };
    }

    const [items, total] = await Promise.all([
      NotificationModel.find(filter).sort(effectiveSort).skip(skip).limit(limit).lean().exec(),
      NotificationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as INotification[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async findById(id: string, recipientType: "admin" | "customer"): Promise<INotification | null> {
    return (await NotificationModel.findOne({ _id: id, recipientType })
      .lean()
      .exec()) as unknown as INotification | null;
  },

  async create(data: CreateNotificationInput): Promise<INotification> {
    const doc = await NotificationModel.create({
      recipientId: data.recipientId,
      recipientType: data.recipientType ?? "admin",
      type: data.type,
      title: data.title,
      message: data.message ?? null,
      priority: data.priority ?? "normal",
      read: false,
      readAt: null,
      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      actionUrl: data.actionUrl ?? null,
      metadata: data.metadata ?? null,
    });
    return doc.toObject() as unknown as INotification;
  },

  async markAsRead(
    id: string,
    recipientId: string,
    recipientType: "admin" | "customer",
  ): Promise<INotification | null> {
    return (await NotificationModel.findOneAndUpdate(
      { _id: id, recipientId, recipientType },
      { $set: { read: true, readAt: new Date() } },
      { new: true, runValidators: true },
    )
      .lean()
      .exec()) as unknown as INotification | null;
  },

  async markAllAsRead(recipientId: string, recipientType: "admin" | "customer"): Promise<number> {
    const result = await NotificationModel.updateMany(
      { recipientId, recipientType, read: false },
      { $set: { read: true, readAt: new Date() } },
    ).exec();
    return result.modifiedCount;
  },

  async deleteById(
    id: string,
    recipientId: string,
    recipientType: "admin" | "customer",
  ): Promise<INotification | null> {
    return (await NotificationModel.findOneAndDelete({
      _id: id,
      recipientId,
      recipientType,
    })
      .lean()
      .exec()) as unknown as INotification | null;
  },

  async countUnread(recipientId: string, recipientType: "admin" | "customer"): Promise<number> {
    return NotificationModel.countDocuments({
      recipientId,
      recipientType,
      read: false,
    }).exec();
  },

  /**
   * Dedupe guard for lifecycle notifications (Phase 16D): true when the
   * recipient already has a notification of this type for this entity, so a
   * retried lifecycle operation never creates a duplicate notification.
   */
  async existsFor(
    recipientId: string,
    recipientType: "admin" | "customer",
    type: string,
    entityId?: string,
  ): Promise<boolean> {
    const filter: Record<string, unknown> = { recipientId, recipientType, type };
    if (entityId) filter.entityId = entityId;
    return (await NotificationModel.countDocuments(filter).exec()) > 0;
  },
};
