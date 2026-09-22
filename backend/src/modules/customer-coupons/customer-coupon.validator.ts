import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

const COUPON_CODE_PATTERN = /^[A-Za-z0-9_-]{3,50}$/;

/**
 * Coupon validation body. Only a code (and optional product/quantity lines)
 * are accepted. No customer id and no financial fields (subtotal, total,
 * discount, price, unitPrice, shipping, tax, amount, cost, maxDiscount) are
 * ever accepted — strict mode rejects them as unknown keys.
 */
export const validateCouponSchema = z
  .object({
    code: z.string().trim().regex(COUPON_CODE_PATTERN, "Invalid coupon code").toUpperCase(),
    items: z
      .array(
        z.object({
          productId: objectIdSchema,
          quantity: z.coerce.number().int().min(1).max(999),
        }),
      )
      .max(100)
      .optional(),
  })
  .strict();

export const customerCouponListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().trim().max(50).optional(),
});
