import { paginationMeta } from "../../utils/pagination.js";
import { ensureCrmCustomer } from "../customer-orders/customer-order.service.js";
import { couponRedemptionRepository } from "../coupons/coupon-redemption.repository.js";
import { couponRepository } from "../coupons/coupon.repository.js";
import { productRepository } from "../products/product.repository.js";
import type { ICoupon } from "../coupons/coupon.model.js";
import type {
  CouponValidateInput,
  CouponValidationResult,
  CustomerCouponDto,
  CustomerCouponListParams,
} from "./customer-coupon.types.js";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function perCustomerRemaining(coupon: ICoupon, usedByCustomer: number): number | null {
  if (coupon.perCustomerLimit <= 0) return null; // unlimited
  return Math.max(0, coupon.perCustomerLimit - usedByCustomer);
}

function toCustomerCouponDto(coupon: ICoupon, remaining: number | null): CustomerCouponDto {
  const now = Date.now();
  const inWindow =
    new Date(coupon.startAt).getTime() <= now && new Date(coupon.endAt).getTime() >= now;
  const globalAvailable = coupon.usageLimit === 0 || coupon.used < coupon.usageLimit;
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrder: coupon.minOrder,
    maxDiscount: coupon.maxDiscount,
    endAt: new Date(coupon.endAt).toISOString(),
    applicableCategoryIds: coupon.applicableCategories.map((id) => id.toString()),
    usable: inWindow && globalAvailable && (remaining === null || remaining > 0),
    perCustomerRemaining: remaining,
  };
}

export const customerCouponService = {
  /**
   * Informational coupon validation/pre-check. Existence, window, global usage
   * and per-customer usage are always checked. When line items are supplied,
   * product visibility, applicableCategories, minOrder and the projected
   * discount are evaluated server-side. This NEVER reserves usage — the
   * authoritative enforcement happens again at order creation.
   */
  async validate(
    customerAccountId: string,
    input: CouponValidateInput,
  ): Promise<CouponValidationResult> {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);

    const coupon = await couponRepository.findByCode(input.code);
    if (!coupon) {
      return { valid: false, reason: "not_found", message: "Coupon code not found." };
    }

    const now = Date.now();
    if (new Date(coupon.startAt).getTime() > now) {
      return { valid: false, reason: "scheduled", message: "Coupon is not active yet." };
    }
    if (new Date(coupon.endAt).getTime() < now) {
      return { valid: false, reason: "expired", message: "Coupon has expired." };
    }
    if (coupon.usageLimit > 0 && coupon.used >= coupon.usageLimit) {
      return {
        valid: false,
        reason: "usage_limit",
        message: "Coupon usage limit has been reached.",
      };
    }

    const usedByCustomer = await couponRedemptionRepository.getCustomerUsage(
      coupon._id.toString(),
      crmCustomerId,
    );
    if (coupon.perCustomerLimit > 0 && usedByCustomer >= coupon.perCustomerLimit) {
      return {
        valid: false,
        reason: "per_customer_limit",
        message: "You have already used this coupon the maximum number of times.",
      };
    }
    const remaining = perCustomerRemaining(coupon, usedByCustomer);

    const complete = Boolean(input.items && input.items.length > 0);
    let discount: number | null = null;

    if (complete && input.items) {
      const productIds = input.items.map((item) => item.productId);
      const products = await productRepository.findByIds(productIds);
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      let subtotal = 0;
      const orderCategoryIds: string[] = [];
      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product || product.status !== "Active" || product.searchable === false) {
          return {
            valid: false,
            reason: "product",
            message: "A product in your order is not available.",
          };
        }
        subtotal += product.price * item.quantity;
        if (product.category) orderCategoryIds.push(product.category.toString());
      }
      subtotal = round2(subtotal);

      if (coupon.applicableCategories.length > 0) {
        const allowed = new Set(coupon.applicableCategories.map((id) => id.toString()));
        const applicable = orderCategoryIds.some((catId) => allowed.has(catId));
        if (!applicable) {
          return {
            valid: false,
            reason: "category",
            message: "This coupon does not apply to any item in your order.",
          };
        }
      }

      if (subtotal < coupon.minOrder) {
        return {
          valid: false,
          reason: "minimum_order",
          message: `Minimum order amount for this coupon is ${coupon.minOrder}.`,
        };
      }

      if (coupon.type === "Percentage") {
        const cap = coupon.maxDiscount > 0 ? coupon.maxDiscount : Number.POSITIVE_INFINITY;
        discount = round2(Math.min((subtotal * coupon.value) / 100, cap));
      } else if (coupon.type === "Fixed") {
        discount = round2(Math.min(coupon.value, subtotal));
      } else {
        discount = 0; // Free Shipping has no monetary discount value
      }
    }

    return {
      valid: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        minOrder: coupon.minOrder,
        maxDiscount: coupon.maxDiscount,
        endAt: new Date(coupon.endAt).toISOString(),
        complete,
        discount,
        perCustomerRemaining: remaining,
      },
    };
  },

  /** Customer's usable/redeemable coupons (active window + per-customer remaining). */
  async list(customerAccountId: string, params: CustomerCouponListParams) {
    const crmCustomerId = await ensureCrmCustomer(customerAccountId);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    const active = await couponRepository.listActive();
    const items: CustomerCouponDto[] = [];
    for (const coupon of active) {
      const usedByCustomer = await couponRedemptionRepository.getCustomerUsage(
        coupon._id.toString(),
        crmCustomerId,
      );
      items.push(toCustomerCouponDto(coupon, perCustomerRemaining(coupon, usedByCustomer)));
    }

    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    return { items: pageItems, meta: paginationMeta(items.length, page, pageSize) };
  },
};
