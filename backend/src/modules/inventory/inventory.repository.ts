import { ProductModel } from "../products/product.model.js";
import { paginationMeta, parsePagination } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { InventoryModel, type IInventory, type Warehouse } from "./inventory.model.js";
import type { AdjustStockInput, InventoryRecord, InventorySummaryDto } from "./inventory.types.js";

export interface InventoryListParams {
  q?: string;
  warehouse?: string;
  /** Stock-state filter, mirroring the summary aggregation definitions. */
  status?: "In Stock" | "Low Stock" | "Out of Stock";
  page?: number;
  pageSize?: number;
}

export interface InventoryListResult {
  items: InventoryRecord[];
  meta: PaginationMeta;
}

interface SummaryCountRow {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

interface ValueRow {
  total: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const inventoryRepository = {
  async list(params: InventoryListParams): Promise<InventoryListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.warehouse) filter.warehouse = params.warehouse;

    // Stock-state filter — definitions must stay identical to summary():
    // In Stock = stock > reorderLevel; Low Stock = 0 < stock <= reorderLevel;
    // Out of Stock = stock === 0.
    if (params.status === "Out of Stock") {
      filter.stock = 0;
    } else if (params.status === "Low Stock") {
      filter.$expr = {
        $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$reorderLevel"] }],
      };
    } else if (params.status === "In Stock") {
      filter.$expr = { $gt: ["$stock", "$reorderLevel"] };
    }

    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      const matchingProducts = await ProductModel.find({ name: { $regex: regex } })
        .select("_id")
        .lean()
        .exec();
      const productIds = matchingProducts.map((p) => p._id);
      filter.$or = [{ sku: { $regex: regex } }, { product: { $in: productIds } }];
    }

    const [items, total] = await Promise.all([
      InventoryModel.find(filter)
        .sort({ sku: 1 })
        .skip(skip)
        .limit(limit)
        .populate("product", "name sku")
        .lean()
        .exec(),
      InventoryModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as InventoryRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async findByIdPopulated(id: string): Promise<InventoryRecord | null> {
    return (await InventoryModel.findById(id)
      .populate("product", "name sku")
      .lean()
      .exec()) as unknown as InventoryRecord | null;
  },

  async findOne(productId: string, warehouse: string): Promise<IInventory | null> {
    return (await InventoryModel.findOne({ product: productId, warehouse })
      .lean()
      .exec()) as unknown as IInventory | null;
  },

  /** Applies a signed delta to the stock level and records the adjustment. */
  async adjustStock(
    data: AdjustStockInput & { productId: string; sku: string; actorId: string },
  ): Promise<IInventory> {
    const filter = { product: data.productId, warehouse: data.warehouse };
    const update = {
      $set: { sku: data.sku },
      $inc: { stock: data.delta },
      $push: {
        adjustments: {
          delta: data.delta,
          reason: data.reason,
          note: data.note,
          performedBy: data.actorId,
          at: new Date(),
        },
      },
    };

    const doc = await InventoryModel.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }).exec();

    return doc.toObject() as unknown as IInventory;
  },

  /**
   * Atomically reserves `qty` units of stock for `productId` in `warehouse`.
   *
   * The guarded filter (`available = stock - reserved >= qty`) is evaluated and
   * applied in a single findAndModify, so concurrent orders can never oversell
   * a SKU. Returns `null` when available stock is insufficient or no inventory
   * record exists, in which case the caller must not proceed.
   */
  async reserveStock(
    productId: string,
    warehouse: Warehouse | string,
    qty: number,
  ): Promise<IInventory | null> {
    return (await InventoryModel.findOneAndUpdate(
      {
        product: productId,
        warehouse,
        $expr: { $gte: [{ $subtract: ["$stock", "$reserved"] }, qty] },
      },
      { $inc: { reserved: qty } },
      { new: true },
    ).exec()) as unknown as IInventory | null;
  },

  /** Releases a previously reserved quantity, never letting `reserved` go negative. */
  async releaseReserved(
    productId: string,
    warehouse: Warehouse | string,
    qty: number,
  ): Promise<void> {
    await InventoryModel.updateOne({ product: productId, warehouse, reserved: { $gt: 0 } }, [
      { $set: { reserved: { $max: [{ $subtract: ["$reserved", qty] }, 0] } } },
    ]).exec();
  },

  /**
   * Phase 16I — stock finalization on fulfilment (Delivered).
   *
   * Converts a reservation into a permanent sale atomically: the reserved
   * quantity (clamped to what is actually held) moves out of BOTH `reserved`
   * and `stock`, so `available = stock - reserved` stays consistent, `stock`
   * never goes negative, and double-finalization is clamped to zero.
   */
  async finalizeReserved(
    productId: string,
    warehouse: Warehouse | string,
    qty: number,
  ): Promise<void> {
    await InventoryModel.updateOne({ product: productId, warehouse }, [
      { $set: { __sold: { $min: [{ $max: ["$reserved", 0] }, qty] } } },
      {
        $set: {
          reserved: { $max: [{ $subtract: ["$reserved", "$__sold"] }, 0] },
          stock: { $max: [{ $subtract: ["$stock", "$__sold"] }, 0] },
        },
      },
      { $unset: "__sold" },
    ]).exec();
  },

  async summary(): Promise<InventorySummaryDto> {
    const [countRows, valueRows] = await Promise.all([
      InventoryModel.aggregate<SummaryCountRow>([
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            inStock: { $sum: { $cond: [{ $gt: ["$stock", "$reorderLevel"] }, 1, 0] } },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$reorderLevel"] }] },
                  1,
                  0,
                ],
              },
            },
            outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } },
          },
        },
      ]).exec(),
      InventoryModel.aggregate<ValueRow>([
        {
          $lookup: {
            from: "products",
            localField: "product",
            foreignField: "_id",
            as: "productDoc",
          },
        },
        { $unwind: "$productDoc" },
        { $group: { _id: null, total: { $sum: { $multiply: ["$stock", "$productDoc.cost"] } } } },
      ]).exec(),
    ]);

    const counts = countRows[0] ?? { totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0 };

    return {
      totalProducts: counts.totalProducts,
      inStock: counts.inStock,
      lowStock: counts.lowStock,
      outOfStock: counts.outOfStock,
      inventoryValue: Math.round((valueRows[0]?.total ?? 0) * 100) / 100,
    };
  },
};
