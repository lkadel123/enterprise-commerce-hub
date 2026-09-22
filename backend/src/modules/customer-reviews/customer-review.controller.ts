import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendCreated, sendPaginated } from "../../utils/ApiResponse.js";
import { customerReviewService } from "./customer-review.service.js";
import type {
  CreateCustomerReviewInput,
  CustomerReviewListParams,
} from "./customer-review.types.js";

/**
 * Customer review endpoints. All routes are gated by `customerAuthenticate`;
 * customer identity is taken from `req.customer` only.
 */
export const customerReviewController = {
  create: asyncHandler(async (req, res) => {
    const review = await customerReviewService.create(
      req.customer!.id,
      req.body as CreateCustomerReviewInput,
    );
    sendCreated(res, review, "Review submitted for moderation");
  }),

  list: asyncHandler(async (req, res) => {
    const result = await customerReviewService.list(
      req.customer!.id,
      req.query as unknown as CustomerReviewListParams,
    );
    sendPaginated(res, result.items, result.meta);
  }),
};
