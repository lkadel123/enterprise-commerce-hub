import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { IMAGE_MIME_TYPES } from "./media.model.js";

export const mediaParamsSchema = z.object({ id: objectIdSchema });
export const mediaListQuerySchema = z.object({
  q: z.string().trim().max(255).optional(),
  mimeType: z.enum(IMAGE_MIME_TYPES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().trim().max(100).optional(),
});
export const updateMediaSchema = z
  .object({ alt: z.string().trim().max(200).nullable().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
