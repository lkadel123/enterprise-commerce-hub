import { ProductModel } from "../products/product.model.js";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { BrandModel, type IBrand } from "./brand.model.js";
import type { CreateBrandInput, UpdateBrandInput } from "./brand.types.js";

export interface BrandListParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface BrandListResult {
  items: IBrand[];
  meta: PaginationMeta;
}

export const brandRepository = {
  async list(params: BrandListParams): Promise<BrandListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ name: { $regex: regex } }, { slug: { $regex: regex } }];
    }

    const sort = parseSort(params.sort, ["name", "createdAt"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { name: 1 as const };

    const [items, total] = await Promise.all([
      BrandModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      BrandModel.countDocuments(filter).exec(),
    ]);

    return { items: items as unknown as IBrand[], meta: paginationMeta(total, page, pageSize) };
  },

  async findByIds(ids: string[]): Promise<IBrand[]> {
    if (ids.length === 0) return [];
    return (await BrandModel.find({ _id: { $in: ids } })
      .lean()
      .exec()) as unknown as IBrand[];
  },

  async findById(id: string): Promise<IBrand | null> {
    return (await BrandModel.findById(id).lean().exec()) as unknown as IBrand | null;
  },

  async findByName(name: string): Promise<IBrand | null> {
    return (await BrandModel.findOne({ name }).lean().exec()) as unknown as IBrand | null;
  },

  /** Exact slug lookup (Phase 19 slug-collision pre-check). */
  async findBySlug(slug: string): Promise<IBrand | null> {
    return (await BrandModel.findOne({ slug }).lean().exec()) as unknown as IBrand | null;
  },

  async create(data: CreateBrandInput & { slug: string }): Promise<IBrand> {
    const doc = await BrandModel.create(data);
    return doc.toObject() as unknown as IBrand;
  },

  async updateById(id: string, patch: UpdateBrandInput): Promise<IBrand | null> {
    return (await BrandModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as IBrand | null;
  },

  async deleteById(id: string): Promise<IBrand | null> {
    return (await BrandModel.findByIdAndDelete(id).lean().exec()) as unknown as IBrand | null;
  },

  async productCountsByBrand(): Promise<Record<string, number>> {
    const rows = await ProductModel.aggregate<{ _id: string | null; count: number }>([
      { $match: { brand: { $ne: null } } },
      { $group: { _id: "$brand", count: { $sum: 1 } } },
    ]).exec();
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
  },
};
