import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { NOTIFICATION_PRIORITIES, NOTIFICATION_TYPES } from "./notification.types.js";

export const notificationParamsSchema = z.object({
  id: objectIdSchema,
});

export const notificationListQuerySchema = z.object({
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
  // pageSize is intentionally NOT capped at the schema level: an oversized value
  // must be clamped to the repository max (100), not rejected. parsePagination
  // performs the clamp.
  pageSize: z.coerce.number().int().positive().default(20),
  sort: z.string().optional(),
});

export const createNotificationSchema = z.object({
  recipientId: objectIdSchema,
  recipientType: z.enum(["admin", "customer"]).optional().default("admin"),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().min(1).max(200),
  message: z.string().max(500).optional(),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
  entityType: z.string().max(50).optional(),
  entityId: z.string().max(50).optional(),
  actionUrl: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});
