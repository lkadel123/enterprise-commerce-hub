import { conflict, notFound } from "../../utils/ApiError.js";
import { couponRepository, type CouponListParams } from "./coupon.repository.js";
import type { ICoupon } from "./coupon.model.js";
import type {
  CouponDto,
  CouponStatus,
  CreateCouponInput,
  UpdateCouponInput,
} from "./coupon.types.js";

export function computeCouponStatus(coupon: Pick<ICoupon, "startAt" | "endAt">): CouponStatus {
  const now = Date.now();
  if (new Date(coupon.startAt).getTime() > now) return "Scheduled";
  if (new Date(coupon.endAt).getTime() < now) return "Expired";
  return "Active";
}

function toDto(coupon: ICoupon): CouponDto {
  return {
    id: coupon._id.toString(),
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    minOrder: coupon.minOrder,
    maxDiscount: coupon.maxDiscount,
    usageLimit: coupon.usageLimit,
    perCustomerLimit: coupon.perCustomerLimit,
    applicableCategoryIds: coupon.applicableCategories.map((id) => id.toString()),
    startAt: new Date(coupon.startAt).toISOString(),
    endAt: new Date(coupon.endAt).toISOString(),
    used: coupon.used,
    status: computeCouponStatus(coupon),
    createdAt: new Date(coupon.createdAt).toISOString(),
    updatedAt: new Date(coupon.updatedAt).toISOString(),
  };
}

export const couponService = {
  async list(params: CouponListParams) {
    const { items, meta } = await couponRepository.list(params);
    return { items: items.map((coupon) => toDto(coupon)), meta };
  },

  async getById(id: string): Promise<CouponDto> {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw notFound("Coupon not found.");
    return toDto(coupon);
  },

  async create(input: CreateCouponInput): Promise<CouponDto> {
    const normalizedCode = input.code.toUpperCase();
    const existing = await couponRepository.findByCode(normalizedCode);
    if (existing) throw conflict("A coupon with this code already exists.");

    const coupon = await couponRepository.create({
      ...input,
      code: normalizedCode,
    });
    return toDto(coupon);
  },

  async update(id: string, input: UpdateCouponInput): Promise<CouponDto> {
    const existing = await couponRepository.findById(id);
    if (!existing) throw notFound("Coupon not found.");

    const patch: UpdateCouponInput = {};
    if (input.code) {
      const normalizedCode = input.code.toUpperCase();
      const duplicate = await couponRepository.findByCode(normalizedCode);
      if (duplicate && duplicate._id.toString() !== id) {
        throw conflict("A coupon with this code already exists.");
      }
      patch.code = normalizedCode;
    }
    if (input.type) patch.type = input.type;
    if ("value" in input) patch.value = input.value;
    if ("minOrder" in input) patch.minOrder = input.minOrder;
    if ("maxDiscount" in input) patch.maxDiscount = input.maxDiscount;
    if ("usageLimit" in input) patch.usageLimit = input.usageLimit;
    if ("perCustomerLimit" in input) patch.perCustomerLimit = input.perCustomerLimit;
    if (input.applicableCategoryIds) {
      patch.applicableCategoryIds = input.applicableCategoryIds;
    }
    if ("startAt" in input) patch.startAt = input.startAt;
    if ("endAt" in input) patch.endAt = input.endAt;

    const updated = await couponRepository.updateById(id, patch);
    if (!updated) throw notFound("Coupon not found.");
    return toDto(updated);
  },

  async remove(id: string): Promise<void> {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw notFound("Coupon not found.");
    await couponRepository.deleteById(id);
  },
};
