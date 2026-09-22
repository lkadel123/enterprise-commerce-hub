import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const brandParamsSchema = z.object({
  id: objectIdSchema,
});

export const brandListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  sort: z.string().optional(),
});

export const createBrandSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  logoUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  status: z.enum(["Active", "Hidden"]).default("Active"),
});

export const updateBrandSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    logoUrl: z.string().url().optional().nullable(),
    status: z.enum(["Active", "Hidden"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
