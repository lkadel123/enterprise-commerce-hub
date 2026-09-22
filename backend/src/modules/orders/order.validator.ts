import { z } from "zod";
import { dateInputSchema, objectIdSchema } from "../../utils/zod.js";
import { WAREHOUSES } from "../inventory/inventory.model.js";

export const orderParamsSchema = z.object({
  id: objectIdSchema,
});

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z
    .enum(["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Refunded", "Expired"])
    .optional(),
  payment: z
    .enum(["Credit Card", "Cash on Delivery", "Digital Wallet", "Bank Transfer"])
    .optional(),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  sort: z.string().optional(),
});

const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().min(1).max(100),
});

export const createOrderSchema = z.object({
  customerId: objectIdSchema,
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        qty: z.coerce.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
  paymentMethod: z
    .enum(["Credit Card", "Cash on Delivery", "Digital Wallet", "Bank Transfer"])
    .optional(),
  region: z
    .enum(["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"])
    .optional(),
  warehouse: z.enum(WAREHOUSES).optional(),
  couponCode: z.string().trim().min(1).max(50).optional(),
  shippingFee: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(1000).optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
});

export const setOrderStatusSchema = z.object({
  status: z.enum(["Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Refunded"]),
});

export const setOrderPaymentSchema = z.object({
  paymentStatus: z.enum(["Paid", "Pending", "Refunded", "Failed", "Initiated", "Cancelled"]),
  transactionId: z.string().trim().max(100).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const refundOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  // Phase 16E: explicit refund amount; capped by the server-side paid amount.
  amount: z.coerce.number().positive().max(10_000_000).optional(),
});
