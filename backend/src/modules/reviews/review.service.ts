import { notFound } from "../../utils/ApiError.js";
import { reviewRepository, type ReviewListParams } from "./review.repository.js";
import type { ReviewRecord, ReviewDto, ReviewStatsDto } from "./review.types.js";

function toDto(review: ReviewRecord): ReviewDto {
  return {
    id: review._id.toString(),
    customer: review.customer
      ? { id: review.customer._id.toString(), name: review.customer.name }
      : null,
    product: review.product
      ? { id: review.product._id.toString(), name: review.product.name }
      : null,
    rating: review.rating,
    title: review.title ?? null,
    body: review.body,
    helpfulCount: review.helpfulCount,
    status: review.status,
    createdAt: new Date(review.createdAt).toISOString(),
  };
}

export const reviewService = {
  async list(params: ReviewListParams) {
    const { items, meta } = await reviewRepository.list(params);
    return { items: items.map((review) => toDto(review)), meta };
  },

  async stats(): Promise<ReviewStatsDto> {
    return reviewRepository.stats();
  },

  async setStatus(id: string, status: ReviewRecord["status"]): Promise<ReviewDto> {
    await reviewRepository.setStatus(id, status);

    const updated = await reviewRepository.findByIdPopulated(id);
    if (!updated) throw notFound("Review not found.");
    return toDto(updated);
  },

  async remove(id: string): Promise<void> {
    await reviewRepository.deleteById(id);
  },
};
