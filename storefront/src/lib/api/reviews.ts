import { apiFetch } from "./client";
import type { ApiEnvelope, CustomerReviewDto, Paged, SubmitReviewInput } from "@/types";

export const reviewsApi = {
  /** GET /customer/reviews — the authenticated customer's own reviews. */
  list(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<ApiEnvelope<CustomerReviewDto[]> & { meta?: Paged<CustomerReviewDto>["meta"] }> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
    const qs = search.toString();
    return apiFetch(`/customer/reviews${qs ? `?${qs}` : ""}`);
  },

  /** POST /customer/reviews — submit a review (status forced Pending). */
  create(body: SubmitReviewInput): Promise<ApiEnvelope<CustomerReviewDto>> {
    return apiFetch("/customer/reviews", { method: "POST", body });
  },
};
