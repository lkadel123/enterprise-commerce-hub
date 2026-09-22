import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const productParamsSchema = z.object({
  id: objectIdSchema,
});

export const productStatusSchema = z.enum(["Active", "Draft", "Out of Stock", "Archived"]);

const booleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

const variationSchema = z
  .object({
    size: z.string().trim().max(50).optional(),
    color: z.string().trim().max(50).optional(),
    sku: z.string().trim().min(1).max(64).optional(),

    price: z.coerce.number().finite().min(0).max(999999999.99).optional(),

    stock: z.coerce.number().int().min(0).max(999999999).optional(),
  })
  .strict();

const imageSchema = z
  .object({
    url: z.string().trim().url().max(500),

    alt: z.string().trim().max(200).optional(),

    position: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .strict();

const shippingSchema = z
  .object({
    weightKg: z.coerce.number().finite().min(0).max(100000).optional(),

    shippingClass: z.enum(["standard", "bulky", "fragile"]).optional(),

    lengthCm: z.coerce.number().finite().min(0).max(100000).optional(),

    widthCm: z.coerce.number().finite().min(0).max(100000).optional(),

    heightCm: z.coerce.number().finite().min(0).max(100000).optional(),
  })
  .strict();

const seoSchema = z
  .object({
    title: z.string().trim().max(200).optional(),

    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must contain only lowercase letters, numbers and hyphens.",
      )
      .optional(),

    metaDescription: z.string().trim().max(300).optional(),

    keywords: z.string().trim().max(300).optional(),
  })
  .strict();

export const productListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),

    status: productStatusSchema.optional(),

    category: z.string().trim().max(100).optional(),

    brand: z.string().trim().max(100).optional(),

    page: z.coerce.number().int().min(1).max(10000).default(1),

    pageSize: z.coerce.number().int().min(1).max(100).default(10),

    sort: z.string().trim().max(100).optional(),
  })
  .strict();

const baseProductSchema = z.object({
  name: z.string().trim().min(1).max(200),

  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "SKU contains invalid characters."),

  description: z.string().trim().max(4000).optional(),

  categoryId: objectIdSchema.optional().nullable(),

  brandId: objectIdSchema.optional().nullable(),

  price: z.coerce.number().finite().min(0).max(999999999.99),

  cost: z.coerce.number().finite().min(0).max(999999999.99),

  status: productStatusSchema.default("Draft"),

  featured: booleanSchema.optional(),

  searchable: booleanSchema.optional(),

  images: z.array(imageSchema).max(20).optional(),

  variations: z.array(variationSchema).max(100).optional(),

  shipping: shippingSchema.optional(),

  seo: seoSchema.optional(),
});

export const createProductSchema = baseProductSchema
  .strict()
  .refine((data) => data.cost <= data.price, {
    message: "Cost cannot be greater than product price.",
    path: ["cost"],
  });

export const updateProductSchema = baseProductSchema
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(
    (data) => data.price === undefined || data.cost === undefined || data.cost <= data.price,
    {
      message: "Cost cannot be greater than product price.",
      path: ["cost"],
    },
  );

export const setProductStatusSchema = z.object({
  status: productStatusSchema,
});

export const productIdParamsSchema = z.object({
  id: objectIdSchema,
});
