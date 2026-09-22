import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";
import { CONVERSATION_PRIORITIES, CONVERSATION_STATUSES } from "./support-conversation.model.js";

export const supportConversationParamsSchema = z.object({
  id: objectIdSchema,
});

export const supportConversationListQuerySchema = z.object({
  status: z.enum(CONVERSATION_STATUSES).optional(),
  priority: z.enum(CONVERSATION_PRIORITIES).optional(),
  category: z.string().trim().max(50).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().default(20),
  sort: z.string().optional(),
});

export const createSupportConversationSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  priority: z.enum(CONVERSATION_PRIORITIES).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  relatedOrderId: objectIdSchema.optional(),
  initialMessage: z.string().trim().min(1).max(5000),
});

export const updateSupportConversationSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES).optional(),
  priority: z.enum(CONVERSATION_PRIORITIES).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  relatedOrderId: objectIdSchema.optional().nullable(),
});

/** Customer may only reopen or update status — restricted subset of transitions. */
export const customerStatusUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved"]).optional(),
});
