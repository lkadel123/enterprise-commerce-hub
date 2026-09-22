import { badRequest, notFound } from "../../utils/ApiError.js";
import { productRepository } from "../products/product.repository.js";
import { inventoryRepository, type InventoryListParams } from "./inventory.repository.js";
import type { IInventory } from "./inventory.model.js";
import type { AdjustStockInput, InventoryDto, InventoryRecord } from "./inventory.types.js";

function stockStatus(stock: number, reorderLevel: number): InventoryDto["status"] {
  if (stock === 0) return "Out of Stock";
  if (stock <= reorderLevel) return "Low Stock";
  return "In Stock";
}

function toDto(record: InventoryRecord): InventoryDto {
  return {
    id: record._id.toString(),
    productId: record.product?._id.toString() ?? "",
    productName: record.product?.name ?? null,
    sku: record.sku,
    warehouse: record.warehouse,
    stock: record.stock,
    reserved: record.reserved,
    incoming: record.incoming,
    reorderLevel: record.reorderLevel,
    status: stockStatus(record.stock, record.reorderLevel),
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
  };
}

export const inventoryService = {
  async list(params: InventoryListParams) {
    const { items, meta } = await inventoryRepository.list(params);
    return { items: items.map((item) => toDto(item)), meta };
  },

  async getById(id: string): Promise<InventoryDto> {
    const record = await inventoryRepository.findByIdPopulated(id);
    if (!record) throw notFound("Inventory record not found.");
    return toDto(record);
  },

  async summary() {
    return inventoryRepository.summary();
  },

  async adjust(input: AdjustStockInput, actorId: string): Promise<InventoryDto> {
    if (input.delta === 0) throw badRequest("Delta must not be zero.");

    // Resolve the product by id (preferred) or denormalized sku.
    let product = input.productId ? await productRepository.findById(input.productId) : null;
    if (!product && input.sku) {
      product = await productRepository.findBySku(input.sku);
    }
    if (!product) {
      throw badRequest("Product not found. Provide a valid productId or sku.");
    }

    // Guard against negative stock.
    if (input.delta < 0) {
      const current = await inventoryRepository.findOne(product._id.toString(), input.warehouse);
      const currentStock = current?.stock ?? 0;
      if (currentStock + input.delta < 0) {
        throw badRequest("Cannot reduce stock below zero for this warehouse.");
      }
    }

    const updated = await inventoryRepository.adjustStock({
      productId: product._id.toString(),
      sku: product.sku,
      warehouse: input.warehouse,
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      actorId,
    });

    const populated = await inventoryRepository.findByIdPopulated(updated._id.toString());
    if (!populated) throw notFound("Inventory record not found.");
    return toDto(populated);
  },
};

export type { IInventory };
