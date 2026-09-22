import { z } from "zod";
import { objectIdSchema } from "../../utils/zod.js";

/**
 * Customer review submission. Only product + text content is accepted.
 * Customer identity, moderation status, and financial/internal fields are
 * never accepted (strict mode rejects them as unknown keys).
 */
export const createCustomerReviewSchema = z
  .object({
    /**
     * Phase 18 (G18-02): the owning, delivered order that contained the
     * product. Required server-side eligibility context — never a client
     * assertion of eligibility itself.
     */
    orderId: objectIdSchema,
    productId: objectIdSchema,
    rating: z.coerce.number().int().min(1).max(5),
    title: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export const customerReviewListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
