import { ProductModel } from "../products/product.model.js";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { CategoryModel, type ICategory } from "./category.model.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./category.types.js";

export interface CategoryListParams {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface CategoryListResult {
  items: ICategory[];
  meta: PaginationMeta;
}

export const categoryRepository = {
  async list(params: CategoryListParams): Promise<CategoryListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ name: { $regex: regex } }, { slug: { $regex: regex } }];
    }

    const sort = parseSort(params.sort, ["name", "sort", "createdAt"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { sort: 1 as const };

    const [items, total] = await Promise.all([
      CategoryModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      CategoryModel.countDocuments(filter).exec(),
    ]);

    return { items: items as unknown as ICategory[], meta: paginationMeta(total, page, pageSize) };
  },

  async findByIds(ids: string[]): Promise<ICategory[]> {
    if (ids.length === 0) return [];
    return (await CategoryModel.find({ _id: { $in: ids } })
      .lean()
      .exec()) as unknown as ICategory[];
  },

  async findById(id: string): Promise<ICategory | null> {
    return (await CategoryModel.findById(id).lean().exec()) as unknown as ICategory | null;
  },

  async findByName(name: string): Promise<ICategory | null> {
    return (await CategoryModel.findOne({ name }).lean().exec()) as unknown as ICategory | null;
  },

  /** Exact slug lookup (Phase 19 slug-collision pre-check). */
  async findBySlug(slug: string): Promise<ICategory | null> {
    return (await CategoryModel.findOne({ slug }).lean().exec()) as unknown as ICategory | null;
  },

  async create(data: CreateCategoryInput & { slug: string }): Promise<ICategory> {
    const { parentId, ...rest } = data;
    const doc = await CategoryModel.create({ ...rest, parent: parentId ?? null });
    return doc.toObject() as unknown as ICategory;
  },

  async updateById(id: string, patch: UpdateCategoryInput): Promise<ICategory | null> {
    return (await CategoryModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as ICategory | null;
  },

  async deleteById(id: string): Promise<ICategory | null> {
    return (await CategoryModel.findByIdAndDelete(id).lean().exec()) as unknown as ICategory | null;
  },

  async productCountsByCategory(): Promise<Record<string, number>> {
    const rows = await ProductModel.aggregate<{ _id: string | null; count: number }>([
      { $match: { category: { $ne: null } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]).exec();
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
  },
};
