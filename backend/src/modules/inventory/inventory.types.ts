import type { Types } from "mongoose";
import type { AdjustmentReason, IInventory, Warehouse } from "./inventory.model.js";

export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock";

export interface InventoryDto {
  id: string;
  productId: string;
  productName: string | null;
  sku: string;
  warehouse: string;
  stock: number;
  reserved: number;
  incoming: number;
  reorderLevel: number;
  status: StockStatus;
  updatedAt: string | null;
}

export interface InventorySummaryDto {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  inventoryValue: number;
}

export interface AdjustStockInput {
  productId?: string;
  sku?: string;
  warehouse: Warehouse;
  delta: number;
  reason: AdjustmentReason;
  note?: string;
}

export interface InventoryRecord extends Omit<IInventory, "product" | "adjustments"> {
  product: { _id: Types.ObjectId; name: string; sku: string } | null;
}
