import { z } from "zod";

export const publicProductListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  brand: z.string().trim().max(100).optional(),
  featured: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(48).default(24),
  sort: z.string().trim().max(100).optional(),
});

export const publicSearchSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const publicCategoryListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(48).default(24),
  sort: z.string().trim().max(100).optional(),
});

export const publicBrandListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(48).default(24),
  sort: z.string().trim().max(100).optional(),
});

export const publicProductParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export const publicCategoryParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export const publicBrandParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});

export const publicReviewListQuerySchema = z.object({
  productId: z.string().trim().min(1).max(200),
  page: z.coerce.number().int().positive().max(10000).default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});
