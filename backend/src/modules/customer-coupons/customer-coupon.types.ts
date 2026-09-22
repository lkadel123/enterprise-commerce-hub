import type { CouponType } from "../coupons/coupon.model.js";

/**
 * Customer self-service coupon DTOs and inputs (Phase 7).
 *
 * All financial evaluation and ownership is resolved server-side. The client
 * may only supply a coupon `code` and, optionally, product/quantity line items
 * (to evaluate minOrder / categories / projected discount).
 */
export interface CouponValidateItemInput {
  productId: string;
  quantity: number;
}

export interface CouponValidateInput {
  code: string;
  items?: CouponValidateItemInput[];
}

export type CouponValidationReason =
  | "not_found"
  | "scheduled"
  | "expired"
  | "usage_limit"
  | "per_customer_limit"
  | "product"
  | "category"
  | "minimum_order";

export interface CouponValidationResult {
  valid: boolean;
  coupon?: {
    code: string;
    type: CouponType;
    value: number;
    minOrder: number;
    maxDiscount: number;
    endAt: string;
    /** True when line items were supplied and item-level checks/amounts ran. */
    complete: boolean;
    /** Projected discount when computable; null otherwise. */
    discount: number | null;
    /** Remaining per-customer redemptions; null when unlimited. */
    perCustomerRemaining: number | null;
  };
  reason?: CouponValidationReason;
  message?: string;
}

export interface CustomerCouponDto {
  code: string;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  endAt: string;
  applicableCategoryIds: string[];
  /** False when the customer has already reached their per-customer limit. */
  usable: boolean;
  /** Remaining per-customer redemptions; null when unlimited. */
  perCustomerRemaining: number | null;
}

export interface CustomerCouponListParams {
  page?: number;
  pageSize?: number;
}
