import type { CouponType } from "./coupon.model.js";

export type CouponStatus = "Active" | "Expiring" | "Scheduled" | "Expired";

export interface CouponDto {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount: number;
  usageLimit: number;
  perCustomerLimit: number;
  applicableCategoryIds: string[];
  startAt: string;
  endAt: string;
  used: number;
  status: CouponStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  value: number;
  minOrder?: number;
  maxDiscount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  applicableCategoryIds?: string[];
  startAt: Date;
  endAt: Date;
}

export type UpdateCouponInput = Partial<Omit<CreateCouponInput, "used">>;
