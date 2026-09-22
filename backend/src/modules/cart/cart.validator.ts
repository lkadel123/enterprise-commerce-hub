import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const addToCartSchema = z.object({
  productId: objectIdSchema,
  quantity: z.coerce.number().int().min(1).max(999).optional().default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(999),
});

export const cartItemParamsSchema = z.object({
  productId: objectIdSchema,
});

export const cartListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const mergeCartSchema = z.object({
  items: z
    .array(
      z.object({
        productId: objectIdSchema,
        quantity: z.coerce.number().int().min(1).max(999),
      }),
    )
    .max(100),
});
