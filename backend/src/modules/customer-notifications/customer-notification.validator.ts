import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { NOTIFICATION_PRIORITIES, NOTIFICATION_TYPES } from "./notification.types.js";

export const customerNotificationParamsSchema = z.object({
  id: objectIdSchema,
});

export const customerNotificationListQuerySchema = z.object({
  unread: z
    .string()
    .optional()
    .transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      return undefined;
    }),
  read: z
    .string()
    .optional()
    .transform((val) => {
      if (val === "true") return true;
      if (val === "false") return false;
      return undefined;
    }),
  type: z.enum(NOTIFICATION_TYPES).optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
  sort: z.string().optional(),
});
