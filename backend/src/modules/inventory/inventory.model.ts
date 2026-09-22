import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const WAREHOUSES = ["Rotterdam DC", "Newark DC", "Singapore DC"] as const;
export type Warehouse = (typeof WAREHOUSES)[number];

export const ADJUSTMENT_REASONS = [
  "received",
  "writeOff",
  "transfer",
  "allocation",
  "manual",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export interface IStockAdjustment {
  delta: number;
  reason: AdjustmentReason;
  note?: string;
  performedBy: Types.ObjectId;
  at: Date;
}

export interface IInventory {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  warehouse: string;
  stock: number;
  reserved: number;
  incoming: number;
  reorderLevel: number;
  adjustments: IStockAdjustment[];
  createdAt: Date;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    warehouse: { type: String, enum: [...WAREHOUSES], required: true },
    stock: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    incoming: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 25, min: 0 },
    adjustments: [
      {
        delta: { type: Number, required: true },
        reason: { type: String, enum: [...ADJUSTMENT_REASONS], required: true },
        note: { type: String, maxlength: 300 },
        performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, versionKey: false },
);

inventorySchema.index({ product: 1, warehouse: 1 }, { unique: true });
inventorySchema.index({ sku: 1 });

export type InventoryDoc = HydratedDocument<IInventory>;

export const InventoryModel = model<IInventory>("Inventory", inventorySchema);
