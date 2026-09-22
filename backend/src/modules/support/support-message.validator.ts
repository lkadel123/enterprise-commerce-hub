import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { SENDER_TYPES } from "./support-message.model.js";

export const supportMessageParamsSchema = z.object({
  id: objectIdSchema,
  conversationId: objectIdSchema,
});

export const supportMessageListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  sort: z.string().optional(),
});

export const createSupportMessageSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  senderType: z.enum(SENDER_TYPES).optional().default("customer"),
});
