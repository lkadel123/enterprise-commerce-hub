import { z } from "zod";
import { dateInputSchema } from "../../utils/zod.js";

export const reportQuerySchema = z.object({
  from: dateInputSchema.optional(),
  to: dateInputSchema.optional(),
  granularity: z.enum(["daily", "weekly", "monthly", "yearly"]).default("monthly"),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
