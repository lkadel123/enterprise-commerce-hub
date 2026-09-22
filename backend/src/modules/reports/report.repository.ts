import { CustomerModel } from "../customers/customer.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { OrderModel } from "../orders/order.model.js";
import { ReviewModel } from "../reviews/review.model.js";
import { ReportRecordModel, type IReportRecord } from "./report.model.js";
import type { ReportQueryParams } from "./report.types.js";

export interface RevenueRow {
  _id: string;
  revenue: number;
  orders: number;
}

export interface ProfitRow {
  _id: string;
  profit: number;
}

export interface CategoryRow {
  _id: string | null;
  value: number;
}

export interface RegionRow {
  _id: string | null;
  value: number;
}

export interface PaymentRow {
  _id: string;
  value: number;
}

export interface TopProductRow {
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

interface AvgRow {
  average: number | null;
}

const GRANULARITY_FORMAT: Record<string, string> = {
  daily: "%Y-%m-%d",
  weekly: "%G-W%V",
  monthly: "%Y-%m",
  yearly: "%Y",
};

/**
 * Phase 20 — revenue business filter.
 *
 * Revenue must only ever be realized from orders whose payment actually settled
 * (`payment.status === "Paid"`). Pending/Initiated/Failed/Cancelled/Expired
 * payments are not revenue, and a Refunded payment reverses revenue, so every
 * revenue aggregation matches the paid filter below. Order *counts* (statuses,
 * fulfillment dashboards) intentionally still include every order.
 */
const PAID_FILTER: Record<string, unknown> = { "payment.status": "Paid" };

function paidMatch(params: ReportQueryParams): Record<string, unknown> {
  const dateOps = dateMatch(params);
  const createdAt = Object.keys(dateOps).length > 0 ? dateOps : { $exists: true };
  return { createdAt, ...PAID_FILTER };
}

function dateMatch(params: ReportQueryParams): Record<string, Date> {
  const match: Record<string, Date> = {};
  if (params.from) match.$gte = new Date(params.from);
  if (params.to) {
    const end = new Date(params.to);
    end.setHours(23, 59, 59, 999);
    match.$lte = end;
  }
  return match;
}

export const reportRepository = {
  async revenueSeries(
    params: Omit<ReportQueryParams, "limit">,
  ): Promise<{ revenue: RevenueRow[]; profit: ProfitRow[] }> {
    const granularity = params.granularity ?? "monthly";
    const format = GRANULARITY_FORMAT[granularity];
    const match = paidMatch(params);

    const [revenueRows, profitRows] = await Promise.all([
      OrderModel.aggregate<RevenueRow>([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format, date: "$createdAt" } },
            revenue: { $sum: "$amounts.total" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec(),
      OrderModel.aggregate<ProfitRow>([
        { $match: match },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "productDoc",
          },
        },
        { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            key: { $dateToString: { format, date: "$createdAt" } },
            profitPerItem: {
              $multiply: [
                "$items.qty",
                { $subtract: ["$items.unitPrice", { $ifNull: ["$productDoc.cost", 0] }] },
              ],
            },
          },
        },
        { $group: { _id: "$key", profit: { $sum: "$profitPerItem" } } },
        { $sort: { _id: 1 } },
      ]).exec(),
    ]);

    return { revenue: revenueRows, profit: profitRows };
  },

  async categorySales(
    params: Omit<ReportQueryParams, "granularity" | "limit">,
  ): Promise<CategoryRow[]> {
    return OrderModel.aggregate<CategoryRow>([
      // Net category sales come from settled payments only (Phase 20).
      { $match: paidMatch(params) },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "productDoc.category",
          foreignField: "_id",
          as: "categoryDoc",
        },
      },
      { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$categoryDoc.name",
          value: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { value: -1 } },
    ]).exec();
  },

  async paymentMethods(
    params: Omit<ReportQueryParams, "granularity" | "limit">,
  ): Promise<PaymentRow[]> {
    return OrderModel.aggregate<PaymentRow>([
      // Value per method = settled revenue per method (Phase 20).
      { $match: paidMatch(params) },
      { $group: { _id: "$payment.method", value: { $sum: "$amounts.total" } } },
      { $sort: { value: -1 } },
    ]).exec();
  },

  async regions(params: Omit<ReportQueryParams, "granularity" | "limit">): Promise<RegionRow[]> {
    return OrderModel.aggregate<RegionRow>([
      // Value per region = settled revenue per region (same paid-only semantics
      // as every other revenue report — Phase 20 / F-02).
      { $match: paidMatch(params) },
      { $group: { _id: "$region", value: { $sum: "$amounts.total" } } },
      { $sort: { value: -1 } },
    ]).exec();
  },

  async topProducts(limit: number): Promise<TopProductRow[]> {
    return OrderModel.aggregate<TopProductRow>([
      // Top products are ranked by settled revenue (Phase 20).
      { $match: PAID_FILTER },
      { $unwind: "$items" },
      {
        $group: {
          _id: { sku: "$items.sku", name: "$items.name" },
          unitsSold: { $sum: "$items.qty" },
          revenue: { $sum: "$items.lineTotal" },
        },
      },
      { $project: { _id: 0, sku: "$_id.sku", name: "$_id.name", unitsSold: 1, revenue: 1 } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ]).exec();
  },

  async overview(): Promise<{
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    avgOrderValue: number;
    lowStockItems: number;
    pendingReviews: number;
    ordersByStatus: Record<string, number>;
  }> {
    const [totals, customerCount, lowStock, pendingReviews, statusRows] = await Promise.all([
      OrderModel.aggregate<{ revenue: number; orders: number }>([
        // totalRevenue = settled revenue only (Phase 20). `orders` within this
        // pipeline is the PAID order count, used for avgOrderValue below.
        { $match: PAID_FILTER },
        { $group: { _id: null, revenue: { $sum: "$amounts.total" }, orders: { $sum: 1 } } },
      ]).exec(),
      CustomerModel.estimatedDocumentCount().exec(),
      InventoryModel.countDocuments({ $expr: { $lte: ["$stock", "$reorderLevel"] } }).exec(),
      ReviewModel.countDocuments({ status: "Pending" }).exec(),
      // Order counts (statuses, totalOrders) include every order regardless of
      // payment state — fulfillment metrics, not revenue metrics.
      OrderModel.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).exec(),
    ]);

    const row = totals[0] ?? { revenue: 0, orders: 0 };
    const totalOrders = statusRows.reduce((sum, s) => sum + s.count, 0);
    return {
      totalRevenue: Math.round(row.revenue * 100) / 100,
      totalOrders,
      totalCustomers: customerCount,
      avgOrderValue: row.orders > 0 ? Math.round((row.revenue / row.orders) * 100) / 100 : 0,
      lowStockItems: lowStock,
      pendingReviews,
      ordersByStatus: Object.fromEntries(statusRows.map((s) => [s._id, s.count])),
    };
  },

  /** Persists an export record (registry for queued/ready exports). */
  async createRecord(
    data: Omit<IReportRecord, "_id" | "createdAt" | "updatedAt">,
  ): Promise<IReportRecord> {
    const doc = await ReportRecordModel.create(data);
    return doc.toObject() as unknown as IReportRecord;
  },
};

export type { AvgRow };
