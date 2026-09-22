import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendPaginated, sendSuccess } from "../../utils/ApiResponse.js";
import { reviewService } from "./review.service.js";
import type { ReviewListParams } from "./review.repository.js";

export const reviewController = {
  list: asyncHandler(async (req, res) => {
    const result = await reviewService.list(req.query as unknown as ReviewListParams);
    sendPaginated(res, result.items, result.meta);
  }),

  stats: asyncHandler(async (_req, res) => {
    const stats = await reviewService.stats();
    sendSuccess(res, stats);
  }),

  setStatus: asyncHandler(async (req, res) => {
    const review = await reviewService.setStatus(req.params.id as string, req.body.status);
    sendSuccess(res, review, `Review marked as ${req.body.status}`);
  }),

  remove: asyncHandler(async (req, res) => {
    await reviewService.remove(req.params.id as string);
    sendSuccess(res, { id: req.params.id }, "Review deleted successfully");
  }),
};
