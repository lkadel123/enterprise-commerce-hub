import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { BANNER_STATUSES } from "./banner.model.js";

export const bannerParamsSchema = z.object({ id: objectIdSchema });
export const bannerListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(BANNER_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().trim().max(100).optional(),
});
const fields = z.object({
  title: z.string().trim().min(1).max(200),
  imageId: objectIdSchema,
  linkUrl: z.string().trim().url().max(500).nullable().optional(),
  status: z.enum(BANNER_STATUSES).optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000000).optional(),
});
const validDateRange = (data: { startAt?: Date | null; endAt?: Date | null }) =>
  !data.startAt || !data.endAt || data.endAt.getTime() > data.startAt.getTime();
export const createBannerSchema = fields.refine(validDateRange, {
  message: "endAt must be after startAt",
  path: ["endAt"],
});
export const updateBannerSchema = fields
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  })
  .refine(validDateRange, { message: "endAt must be after startAt", path: ["endAt"] });
