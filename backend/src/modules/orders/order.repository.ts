import { Types } from "mongoose";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { CounterModel } from "./counter.model.js";
import { OrderModel, type IOrder, type IOrderTimelineEntry } from "./order.model.js";
import type { OrderRecord } from "./order.types.js";

export interface OrderListParams {
  q?: string;
  status?: string;
  payment?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface OrderListResult {
  items: OrderRecord[];
  meta: PaginationMeta;
}

export interface OrderPatch {
  status?: IOrder["status"];
  "payment.status"?: IOrder["payment"]["status"];
  "payment.transactionId"?: string;
  "payment.provider"?: IOrder["payment"]["provider"];
  "payment.providerTransactionId"?: string;
  "payment.amount"?: number;
  "payment.currency"?: string;
  "payment.initiatedAt"?: Date;
  "payment.paidAt"?: Date;
  "payment.failureReason"?: string | null;
  "payment.metadata"?: Record<string, unknown> | null;
  refund?: IOrder["refund"] | null;
  expiresAt?: Date;
}

export interface CustomerStatsRow {
  orders: number;
  spent: number;
  lastOrder: Date | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const orderRepository = {
  async list(params: OrderListParams): Promise<OrderListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ orderNumber: { $regex: regex } }, { email: { $regex: regex } }];
    }
    if (params.status) filter.status = params.status;
    if (params.payment) filter["payment.method"] = params.payment;
    if (params.from || params.to) {
      const created: Record<string, Date> = {};
      if (params.from) created.$gte = new Date(params.from);
      if (params.to) {
        const end = new Date(params.to);
        end.setHours(23, 59, 59, 999);
        created.$lte = end;
      }
      filter.createdAt = created;
    }

    const sort = parseSort(params.sort, ["createdAt", "orderNumber", "amounts.total", "status"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      OrderModel.find(filter)
        .sort(sortWithDefault)
        .skip(skip)
        .limit(limit)
        .populate("customer", "name email")
        .lean()
        .exec(),
      OrderModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as OrderRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async findByIdPopulated(id: string): Promise<OrderRecord | null> {
    return (await OrderModel.findById(id)
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },

  /** Find an order by the gateway provider transaction ID (stored at initiation). */
  async findByTransactionId(transactionId: string): Promise<OrderRecord | null> {
    return (await OrderModel.findOne({ "payment.providerTransactionId": transactionId })
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },
  /** Find an order by the gateway payment id (stored in `payment.transactionId`). */
  async findByPaymentId(paymentId: string): Promise<OrderRecord | null> {
    return (await OrderModel.findOne({ "payment.transactionId": paymentId })
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },

  /** Find a customer's order by its idempotency key (Phase 16B). */
  async findByIdempotencyKey(customerId: string, key: string): Promise<OrderRecord | null> {
    return (await OrderModel.findOne({
      customer: new Types.ObjectId(customerId),
      idempotencyKey: key,
    })
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },

  /** Orders that are Pending/unpaid and have passed their expiry deadline (Phase 16C). */
  async listPendingToExpire(before: Date): Promise<OrderRecord[]> {
    return (await OrderModel.find({
      status: "Pending",
      "payment.status": { $in: ["Pending", "Initiated"] },
      expiresAt: { $lte: before, $ne: null },
    })
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord[];
  },

  /**
   * Atomically expire a single pending order. Only succeeds while the order is
   * still Pending/Initiated and past its deadline — so concurrent expiry and
   * payment verification resolve safely: whoever commits first wins.
   */
  async expirePendingById(id: string, before: Date): Promise<OrderRecord | null> {
    return (await OrderModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        status: "Pending",
        "payment.status": { $in: ["Pending", "Initiated"] },
        expiresAt: { $lte: before, $ne: null },
      },
      {
        $set: { status: "Expired", "payment.status": "Expired" },
        $push: {
          timeline: { label: "Order expired — payment not completed", at: new Date(), done: true },
        },
      },
      { new: true, runValidators: true },
    )
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },

  /**
   * Atomically mark a payment Paid, only while the order is payable (not
   * Cancelled/Expired/Refunded) and payment is not already terminal. This closes
   * the concurrent verify-vs-cancel/expiry race (Phase 16F).
   */
  async markPaidIfPayable(
    id: string,
    opts: { transactionId?: string; paidAt?: Date } = {},
  ): Promise<OrderRecord | null> {
    const paidAt = opts.paidAt ?? new Date();
    return (await OrderModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        status: { $nin: ["Cancelled", "Expired", "Refunded"] },
        "payment.status": { $nin: ["Refunded"] },
      },
      {
        $set: {
          "payment.status": "Paid",
          "payment.paidAt": paidAt,
          // A successful settlement clears any stale failure reason left by an
          // earlier failed attempt on the same order (gateway retry path:
          // Failed -> re-initiate -> Paid). Without this the customer DTO would
          // keep reporting "Payment verification failed." on a paid order.
          "payment.failureReason": null,
          ...(opts.transactionId ? { "payment.transactionId": opts.transactionId } : {}),
        },
        $push: { timeline: { label: "Payment Paid", at: paidAt, done: true } },
      },
      { new: true, runValidators: true },
    )
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },

  async create(data: Omit<IOrder, "_id" | "createdAt" | "updatedAt">): Promise<IOrder> {
    const doc = await OrderModel.create(data);
    return doc.toObject() as unknown as IOrder;
  },

  /**
   * Phase 16G — atomically cancel an order only while it is genuinely
   * cancellable: status Pending/Processing AND payment not already Paid or
   * Refunded. This closes the cancel-vs-verify race at the database level.
   */
  async cancelIfCancellable(id: string, reason?: string): Promise<OrderRecord | null> {
    return (await OrderModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        status: { $in: ["Pending", "Processing"] },
        "payment.status": { $nin: ["Paid", "Refunded"] },
      },
      {
        $set: { status: "Cancelled" },
        $push: {
          timeline: {
            label: reason ? `Cancelled — ${reason}` : "Cancelled",
            at: new Date(),
            done: true,
          },
        },
      },
      { new: true, runValidators: true },
    )
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord | null;
  },

  /** Atomically mint the next monotonic order number (race-free counter). */
  async nextOrderNumber(): Promise<string> {
    const counter = await CounterModel.findByIdAndUpdate(
      "order",
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return `ORD-${10285 + counter.seq}`;
  },

  async updateById(
    id: string,
    patch: OrderPatch,
    timelineEntry?: IOrderTimelineEntry,
  ): Promise<IOrder | null> {
    const update: Record<string, unknown> = { $set: patch };
    if (timelineEntry) update.$push = { timeline: timelineEntry };
    return (await OrderModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as IOrder | null;
  },

  async count(): Promise<number> {
    return OrderModel.estimatedDocumentCount().exec();
  },

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await OrderModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).exec();
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
  },

  /** Per-customer aggregates: order count, revenue, last order date. */
  async statsForCustomers(customerIds: string[]): Promise<Map<string, CustomerStatsRow>> {
    if (customerIds.length === 0) return new Map();
    const rows = await OrderModel.aggregate<{
      _id: string;
      orders: number;
      spent: number;
      lastOrder: Date | null;
    }>([
      { $match: { customer: { $in: customerIds } } },
      {
        $group: {
          _id: "$customer",
          orders: { $sum: 1 },
          spent: { $sum: "$amounts.total" },
          lastOrder: { $max: "$createdAt" },
        },
      },
    ]).exec();
    return new Map(
      rows.map((row) => [
        row._id.toString(),
        { orders: row.orders, spent: row.spent, lastOrder: row.lastOrder ?? null },
      ]),
    );
  },

  async recentOrdersForCustomer(customerId: string, limit: number): Promise<OrderRecord[]> {
    return (await OrderModel.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("customer", "name email")
      .lean()
      .exec()) as unknown as OrderRecord[];
  },
};
