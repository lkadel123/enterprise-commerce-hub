import { Types } from "mongoose";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { CouponModel, type ICoupon } from "./coupon.model.js";
import type { CreateCouponInput, UpdateCouponInput } from "./coupon.types.js";

export interface CouponListParams {
  q?: string;
  type?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface CouponListResult {
  items: ICoupon[];
  meta: PaginationMeta;
}

export const couponRepository = {
  async list(params: CouponListParams): Promise<CouponListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) filter.code = { $regex: new RegExp(escapeRegExp(params.q), "i") };
    if (params.type) filter.type = params.type;

    const sort = parseSort(params.sort, ["code", "type", "startAt", "endAt", "used", "createdAt"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      CouponModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      CouponModel.countDocuments(filter).exec(),
    ]);

    return { items: items as unknown as ICoupon[], meta: paginationMeta(total, page, pageSize) };
  },

  async findById(id: string): Promise<ICoupon | null> {
    return (await CouponModel.findById(id).lean().exec()) as unknown as ICoupon | null;
  },

  async findByCode(code: string): Promise<ICoupon | null> {
    return (await CouponModel.findOne({ code: code.toUpperCase() })
      .lean()
      .exec()) as unknown as ICoupon | null;
  },

  async create(data: CreateCouponInput): Promise<ICoupon> {
    const { applicableCategoryIds, ...rest } = data;
    const doc = await CouponModel.create({
      ...rest,
      applicableCategories: applicableCategoryIds ?? [],
    });
    return doc.toObject() as unknown as ICoupon;
  },

  async updateById(id: string, patch: UpdateCouponInput): Promise<ICoupon | null> {
    const { applicableCategoryIds, ...rest } = patch;
    const update = {
      ...rest,
      ...(applicableCategoryIds !== undefined
        ? { applicableCategories: applicableCategoryIds }
        : {}),
    };
    return (await CouponModel.findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as ICoupon | null;
  },

  async deleteById(id: string): Promise<ICoupon | null> {
    return (await CouponModel.findByIdAndDelete(id).lean().exec()) as unknown as ICoupon | null;
  },

  async incrementUsed(id: string): Promise<void> {
    await CouponModel.updateOne({ _id: id }, { $inc: { used: 1 } }).exec();
  },

  /**
   * Atomically reserve one global redemption against the coupon's `usageLimit`.
   *
   * The guard runs as part of the same atomic single-document update as the
   * `$inc`, so concurrent requests can never push `used` past `usageLimit`.
   * `usageLimit: 0` means unlimited. Returns false (no increment performed)
   * when the limit is already reached.
   */
  async reserveUsage(id: string): Promise<boolean> {
    const doc = await CouponModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$used", "$usageLimit"] } }],
      },
      { $inc: { used: 1 } },
      { new: true },
    )
      .lean()
      .exec();
    return !!doc;
  },

  /** Coupons currently within their active window with global capacity left. */
  async listActive(): Promise<ICoupon[]> {
    const now = new Date();
    return (await CouponModel.find({
      startAt: { $lte: now },
      endAt: { $gte: now },
      $or: [{ usageLimit: 0 }, { $expr: { $lt: ["$used", "$usageLimit"] } }],
    })
      .sort({ endAt: 1 })
      .lean()
      .exec()) as unknown as ICoupon[];
  },

  async decrementUsed(id: string): Promise<void> {
    await CouponModel.updateOne({ _id: id, used: { $gt: 0 } }, [
      { $set: { used: { $max: [{ $subtract: ["$used", 1] }, 0] } } },
    ]).exec();
  },
};
