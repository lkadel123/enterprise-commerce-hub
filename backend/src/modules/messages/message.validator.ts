import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { MESSAGE_PRIORITIES, MESSAGE_TYPES } from "./message.types.js";
const actionUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
    "Action URL must be a relative path or HTTP(S) URL.",
  );
export const messageParamsSchema = z.object({ id: objectIdSchema });
export const messageListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["read", "unread"]).optional(),
  type: z.enum(MESSAGE_TYPES).optional(),
  priority: z.enum(MESSAGE_PRIORITIES).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});
export const createMessageSchema = z.object({
  recipientId: objectIdSchema,
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  type: z.enum(MESSAGE_TYPES).optional(),
  priority: z.enum(MESSAGE_PRIORITIES).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(50).optional(),
  actionUrl: actionUrl.optional(),
  metadata: z.record(z.unknown()).optional(),
});
