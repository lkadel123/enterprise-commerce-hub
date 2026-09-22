import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const reviewParamsSchema = z.object({
  id: objectIdSchema,
});

export const reviewListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["Approved", "Pending", "Rejected", "Hidden"]).optional(),
  productId: objectIdSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});

export const updateReviewStatusSchema = z.object({
  status: z.enum(["Approved", "Pending", "Rejected", "Hidden"]),
});
