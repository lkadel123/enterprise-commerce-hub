import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

export const customerAddressParamsSchema = z.object({
  id: objectIdSchema,
});

export const createCustomerAddressSchema = z.object({
  label: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(255),
  line2: z.string().trim().max(255).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(2).max(100),
  isDefault: z.boolean().optional(),
});

export const updateCustomerAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    line1: z.string().trim().min(1).max(255).optional(),
    line2: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().max(100).optional().nullable(),
    postalCode: z.string().trim().min(1).max(20).optional(),
    country: z.string().trim().min(2).max(100).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
