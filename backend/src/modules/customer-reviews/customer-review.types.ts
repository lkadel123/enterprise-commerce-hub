/**
 * Customer self-service review DTOs and inputs (Phase 7).
 *
 * Identity is NEVER supplied by the client. The CRM customer reference is
 * resolved server-side from `req.customer` via `ensureCrmCustomer`.
 */
export interface CreateCustomerReviewInput {
  /**
   * The customer's own order that contained the product being reviewed.
   *
   * Phase 18 (G18-02): review creation is gated on a *delivered* order that
   * the authenticated customer owns and that actually contained the product.
   * `orderId` is required so the backend can establish eligibility
   * server-side; the client can never bypass the gate.
   */
  orderId: string;
  productId: string;
  rating: number;
  title?: string;
  body: string;
}

export interface CustomerReviewListParams {
  page?: number;
  pageSize?: number;
}
