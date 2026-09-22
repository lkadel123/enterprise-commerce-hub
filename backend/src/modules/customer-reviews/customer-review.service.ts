import { Types } from "mongoose";
import { badRequest, conflict, notFound } from "../../utils/ApiError.js";
import { ensureCrmCustomer } from "../customer-orders/customer-order.service.js";
import { customerOrderRepository } from "../customer-orders/customer-order.repository.js";
import { productRepository } from "../products/product.repository.js";
import { reviewRepository } from "../reviews/review.repository.js";
import type { IReview } from "../reviews/review.model.js";
import type { ReviewDto, ReviewRecord } from "../reviews/review.types.js";
import type {
  CreateCustomerReviewInput,
  CustomerReviewListParams,
} from "./customer-review.types.js";
import { notificationService } from "../notifications/notification.service.js";
import { logger } from "../../utils/logger.js";

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/** Maps a populated review to the existing safe public DTO shape. */
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

/** Throw unless the product exists and is customer-visible (public catalog rules). */
async function assertReviewableProduct(productId: string): Promise<void> {
  const product = await productRepository.findById(productId);
  if (!product || product.status !== "Active" || product.searchable === false) {
    throw badRequest("Product not found or not available for review.");
  }
}

/**
 * Phase 18 (G18-02) — authoritative, server-side review eligibility gate.
 *
 * A customer may only review a product when the backend can establish, from
 * database state alone, that:
 *   1. there is a delivered order that the authenticated customer owns
 *      (ownership is enforced by the query — a foreign/non-existent order id
 *      yields a generic 404 and never leaks another customer's data);
 *   2. the order reached the canonical `Delivered` state;
 *   3. the product being reviewed is actually contained in that delivered
 *      order.
 *
 * Eligibility is therefore enforced here, not trusted from the client.
 */
async function assertReviewEligibility(
  crmCustomerId: string,
  orderId: string,
  productId: string,
): Promise<void> {
  // Ownership-scoped lookup: returns null for a non-existent order OR for
  // another customer's order, so we never reveal whether the order exists.
  const order = await customerOrderRepository.findByIdForCustomer(orderId, crmCustomerId);
  if (!order) throw notFound("Order not found.");

  // The canonical delivered state (see OrderModel.ORDER_STATUSES / the lifecycle
  // transition table in order.service.ts). We never invent a new status.
  if (order.status !== "Delivered") {
    throw badRequest(
      `Product can only be reviewed after the order is delivered (current status: "${order.status}").`,
    );
  }

  const ids = order.items.map((item) => item.product.toString());
  if (!ids.includes(productId)) {
    throw badRequest("This product was not part of the referenced delivered order.");
  }
}

export const customerReviewService = {
  /**
   * Submit a review as the authenticated customer. Resolves identity to the
   * CRM Customer, forces status "Pending", and prevents duplicate
   * (customer, product) reviews — including under concurrency, via the unique
   * index + duplicate-key handling.
   *
   * Phase 18 (G18-02): creation is gated on the delivered order that owns the
   * product (see `assertReviewEligibility`). The backend is authoritative;
   * frontend gating alone is never sufficient.
   */
  async create(customerAccountId: string, input: CreateCustomerReviewInput): Promise<ReviewDto> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    await assertReviewableProduct(input.productId);
    await assertReviewEligibility(crmCustomerId, input.orderId, input.productId);

    const existing = await reviewRepository.findByCustomerAndProduct(
      crmCustomerId,
      input.productId,
    );
    if (existing) throw conflict("You have already reviewed this product.");

    let review: IReview;
    try {
      review = await reviewRepository.create({
        customer: new Types.ObjectId(crmCustomerId),
        product: new Types.ObjectId(input.productId),
        rating: input.rating,
        title: input.title,
        body: input.body,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw conflict("You have already reviewed this product.");
      }
      throw error;
    }

    const populated = await reviewRepository.findByIdPopulated(review._id.toString());
    if (!populated) throw notFound("Review not found.");

    // Notify customer of review submission (non-blocking, best-effort)
    try {
      await notificationService.notifyCustomer(
        customerAccountId,
        "review_submitted",
        `Your review has been submitted for product ${populated.product!.name}`,
        {
          entityType: "product",
          entityId: populated.product!._id.toString(),
          actionUrl: `/products/${populated.product!._id.toString()}`,
          metadata: {
            reviewId: populated._id.toString(),
            productId: populated.product!._id.toString(),
          },
        },
      );
    } catch (notifyError) {
      /* non-fatal */ logger.error(
        { reviewId: populated._id.toString(), crmCustomerId, error: notifyError },
        "Failed to create review submission notification",
      );
    }

    return toDto(populated);
  },

  /** List only the authenticated customer's own reviews. */
  async list(customerAccountId: string, params: CustomerReviewListParams) {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const { items, meta } = await reviewRepository.listByCustomer(crmCustomerId, params);
    return { items: items.map((review) => toDto(review)), meta };
  },
};
