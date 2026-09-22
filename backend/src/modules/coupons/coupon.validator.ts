import { z } from "zod";
import { dateInputSchema, objectIdSchema } from "../../utils/zod.js";

export const couponParamsSchema = z.object({
  id: objectIdSchema,
});

export const couponListQuerySchema = z.object({
  q: z.string().trim().max(50).optional(),
  type: z.enum(["Percentage", "Fixed", "Free Shipping"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});

const couponFieldsSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,50}$/, "Code must be 3-50 characters of A-Z, 0-9, _ or -"),

  type: z.enum(["Percentage", "Fixed", "Free Shipping"]),

  value: z.coerce.number().min(0),

  minOrder: z.coerce.number().min(0).default(0),

  maxDiscount: z.coerce.number().min(0).default(0),

  usageLimit: z.coerce.number().int().min(0).default(0),

  perCustomerLimit: z.coerce.number().int().min(0).default(1),

  applicableCategoryIds: z.array(objectIdSchema).max(100).optional(),

  startAt: z.coerce.date(),

  endAt: z.coerce.date(),
});

export const createCouponSchema = couponFieldsSchema.refine(
  (data) => data.endAt.getTime() > data.startAt.getTime(),
  {
    message: "endAt must be after startAt",
    path: ["endAt"],
  },
);

export const updateCouponSchema = couponFieldsSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(
    (data) => {
      if (data.startAt && data.endAt) {
        return data.endAt.getTime() > data.startAt.getTime();
      }

      return true;
    },
    {
      message: "endAt must be after startAt",
      path: ["endAt"],
    },
  );

export { dateInputSchema };
