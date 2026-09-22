import { apiFetch } from "./client";
import type {
  ApiEnvelope,
  CouponValidateInput,
  CouponValidationResult,
  CustomerCouponDto,
  Paged,
} from "@/types";

/**
 * Customer coupons API client.
 *
 * Mirrors the backend `customer-coupons` module mounted at
 * `/api/v1/customer/coupons` (see
 * `backend/src/modules/customer-coupons/customer-coupon.routes.ts`).
 *
 * SECURITY: the validate body contains ONLY `{code, items?}` — the backend
 * schema is `.strict()` and rejects any financial field. Validation results
 * are advisory only; the authoritative discount is computed again at order
 * creation.
 */
export const couponsApi = {
  /** POST /customer/coupons/validate — advisory coupon pre-check. */
  validate(body: CouponValidateInput): Promise<ApiEnvelope<CouponValidationResult>> {
    return apiFetch<ApiEnvelope<CouponValidationResult>>("/customer/coupons/validate", {
      method: "POST",
      body,
    });
  },

  /** GET /customer/coupons — the customer's usable coupons. */
  list(params?: {
    page?: number;
    pageSize?: number;
  }): Promise<ApiEnvelope<CustomerCouponDto[]> & { meta?: Paged<CustomerCouponDto>["meta"] }> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.pageSize !== undefined) search.set("pageSize", String(params.pageSize));
    const qs = search.toString();
    return apiFetch(`/customer/coupons${qs ? `?${qs}` : ""}`);
  },
};
