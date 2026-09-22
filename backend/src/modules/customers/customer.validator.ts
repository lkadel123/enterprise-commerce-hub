import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const customerParamsSchema = z.object({
  id: objectIdSchema,
});

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  group: z.enum(["Retail", "Loyalty", "Wholesale"]).optional(),
  status: z.enum(["Active", "New", "VIP", "Blocked"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  sort: z.string().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  group: z.enum(["Retail", "Loyalty", "Wholesale"]).default("Retail"),
  status: z.enum(["Active", "New", "VIP", "Blocked"]).default("Active"),
  city: z.string().trim().max(100).optional(),
});

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).optional().nullable(),
    group: z.enum(["Retail", "Loyalty", "Wholesale"]).optional(),
    status: z.enum(["Active", "New", "VIP", "Blocked"]).optional(),
    city: z.string().trim().max(100).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
