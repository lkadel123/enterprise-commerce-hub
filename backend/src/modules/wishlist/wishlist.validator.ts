import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const addToWishlistSchema = z.object({
  productId: objectIdSchema,
});

export const wishlistItemParamsSchema = z.object({
  productId: objectIdSchema,
});

export const wishlistListQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});
