import { z } from "zod";
import { dateInputSchema, objectIdSchema } from "../../utils/zod.js";
import { ORDER_STATUSES, PAYMENT_METHODS } from "../orders/order.model.js";

export const customerOrderParamsSchema = z.object({
  id: objectIdSchema,
});

export const customerOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(ORDER_STATUSES).optional(),
  sort: z.string().trim().max(50).optional(),
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
});

const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().min(1).max(100),
});

/**
 * Customer checkout input. Only product IDs + quantities are accepted; all
 * financial values are computed server-side by `orderService.create`.
 */
export const createCustomerOrderSchema = z.object({
  // Optional — when omitted the server cart is used as the source of line items.
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        quantity: z.coerce.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100)
    .optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  /** Checkout-time gateway hint for the post-order payment flow. */
  paymentGateway: z.enum(["FONEPAY", "CYBERSOURCE"]).optional(),
  couponCode: z.string().trim().min(1).max(50).optional(),
  notes: z.string().trim().max(1000).optional(),
});
