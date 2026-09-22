import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { WAREHOUSES } from "./inventory.model.js";

export const inventoryParamsSchema = z.object({
  id: objectIdSchema,
});

export const inventoryListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  warehouse: z.enum(WAREHOUSES).optional(),
  /** Optional stock-state filter: "In Stock" | "Low Stock" | "Out of Stock". */
  status: z.enum(["In Stock", "Low Stock", "Out of Stock"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});

export const adjustStockSchema = z
  .object({
    productId: objectIdSchema.optional(),
    sku: z.string().trim().min(1).max(64).optional(),
    warehouse: z.enum(WAREHOUSES),
    delta: z.coerce
      .number()
      .int()
      .refine((value) => value !== 0, {
        message: "Delta must not be zero.",
      }),
    reason: z.enum(["received", "writeOff", "transfer", "allocation", "manual"]),
    note: z.string().trim().max(300).optional(),
  })
  .refine((data) => Boolean(data.productId || data.sku), {
    message: "Provide either productId or sku.",
  });
