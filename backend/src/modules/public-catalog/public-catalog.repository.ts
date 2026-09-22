import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { ProductModel, type IProduct } from "../products/product.model.js";
import { CategoryModel, type ICategory } from "../categories/category.model.js";
import { BrandModel, type IBrand } from "../brands/brand.model.js";
import { InventoryModel } from "../inventory/inventory.model.js";
import { BannerModel, type IBanner } from "../banners/banner.model.js";
import { ReviewModel, type IReview } from "../reviews/review.model.js";
import mongoose from "mongoose";

export interface PublicProductListParams {
  q?: string;
  category?: string;
  brand?: string;
  featured?: boolean;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface PublicListResult<T> {
  items: T[];
  meta: PaginationMeta;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function publicCategoryFilter(q?: string): Record<string, unknown> {
  const filter: Record<string, unknown> = { status: "Active" };
  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    filter.$or = [{ name: { $regex: regex } }, { slug: { $regex: regex } }];
  }
  return filter;
}

export const publicCatalogRepository = {
  async listProducts(
    params: PublicProductListParams,
    categoryId?: string,
    brandId?: string,
  ): Promise<PublicListResult<IProduct>> {
    const { page, pageSize, skip, limit } = parsePagination(params, 24, 48);

    const filter: Record<string, unknown> = { status: "Active", searchable: true };
    if (params.featured === true) filter.featured = true;
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ name: { $regex: regex } }, { sku: { $regex: regex } }];
    }
    if (categoryId) filter.category = categoryId;
    if (brandId) filter.brand = brandId;

    const sort = parseSort(params.sort, [
      "name",
      "price",
      "rating",
      "reviewsCount",
      "featured",
      "createdAt",
    ]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };

    const [items, total] = await Promise.all([
      ProductModel.find(filter)
        .sort(sortWithDefault)
        .skip(skip)
        .limit(limit)
        .populate("category", "name slug")
        .populate("brand", "name slug")
        .lean()
        .exec(),
      ProductModel.countDocuments(filter).exec(),
    ]);

    return { items: items as unknown as IProduct[], meta: paginationMeta(total, page, pageSize) };
  },

  async findProductByIdOrSlug(identifier: string): Promise<IProduct | null> {
    let product: IProduct | null = null;
    if (OBJECT_ID.test(identifier)) {
      product = (await ProductModel.findById(identifier)
        .populate("category", "name slug")
        .populate("brand", "name slug")
        .lean()
        .exec()) as unknown as IProduct | null;
    }
    if (!product) {
      product = (await ProductModel.findOne({ slug: identifier })
        .populate("category", "name slug")
        .populate("brand", "name slug")
        .lean()
        .exec()) as unknown as IProduct | null;
    }
    return product;
  },

  async inventoryTotals(
    productIds: string[],
  ): Promise<Map<string, { stock: number; reserved: number; available: number }>> {
    if (productIds.length === 0) return new Map();
    // `product` is stored as ObjectId — string ids never match in $in.
    const objectIds = productIds.map((id) => new mongoose.Types.ObjectId(id));
    const rows = await InventoryModel.aggregate<{
      _id: string;
      stock: number;
      reserved: number;
      available: number;
    }>([
      { $match: { product: { $in: objectIds } } },
      {
        $group: {
          _id: "$product",
          stock: { $sum: "$stock" },
          reserved: { $sum: "$reserved" },
          // F-05: availability clamps per inventory record (available = max(0, stock - reserved)),
          // then sums — a fully-reserved warehouse never contributes phantom public stock.
          available: {
            $sum: { $max: [0, { $subtract: ["$stock", { $ifNull: ["$reserved", 0] }] }] },
          },
        },
      },
    ]).exec();
    return new Map(
      rows.map((row) => [
        row._id.toString(),
        { stock: row.stock, reserved: row.reserved, available: row.available },
      ]),
    );
  },

  async resolveCategory(identifier: string): Promise<ICategory | null> {
    if (OBJECT_ID.test(identifier)) {
      return (await CategoryModel.findOne({ _id: identifier, status: "Active" })
        .lean()
        .exec()) as unknown as ICategory | null;
    }
    return (await CategoryModel.findOne({ slug: identifier, status: "Active" })
      .lean()
      .exec()) as unknown as ICategory | null;
  },

  async listCategories(params: {
    q?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
  }): Promise<PublicListResult<ICategory>> {
    const { page, pageSize, skip, limit } = parsePagination(params, 24, 48);
    const filter = publicCategoryFilter(params.q);
    const sort = parseSort(params.sort, ["name", "sort", "createdAt"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { sort: 1 as const };
    const [items, total] = await Promise.all([
      CategoryModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      CategoryModel.countDocuments(filter).exec(),
    ]);
    return { items: items as unknown as ICategory[], meta: paginationMeta(total, page, pageSize) };
  },

  async resolveBrand(identifier: string): Promise<IBrand | null> {
    if (OBJECT_ID.test(identifier)) {
      return (await BrandModel.findOne({ _id: identifier, status: "Active" })
        .lean()
        .exec()) as unknown as IBrand | null;
    }
    return (await BrandModel.findOne({ slug: identifier, status: "Active" })
      .lean()
      .exec()) as unknown as IBrand | null;
  },

  async listBrands(params: {
    q?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
  }): Promise<PublicListResult<IBrand>> {
    const { page, pageSize, skip, limit } = parsePagination(params, 24, 48);
    const filter: Record<string, unknown> = { status: "Active" };
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

  async productCountsByCategory(): Promise<Record<string, number>> {
    const rows = await ProductModel.aggregate<{ _id: string | null; count: number }>([
      { $match: { status: "Active", searchable: true, category: { $ne: null } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]).exec();
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
  },

  async productCountsByBrand(): Promise<Record<string, number>> {
    const rows = await ProductModel.aggregate<{ _id: string | null; count: number }>([
      { $match: { status: "Active", searchable: true, brand: { $ne: null } } },
      { $group: { _id: "$brand", count: { $sum: 1 } } },
    ]).exec();
    return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
  },

  async findCategoryById(id: string): Promise<ICategory | null> {
    return (await CategoryModel.findById(id).lean().exec()) as unknown as ICategory | null;
  },

  /** Public, crawlable product slugs — same visibility rule as `listProducts`. */
  async listPublicProductSlugs(): Promise<string[]> {
    const rows = await ProductModel.find(
      { status: "Active", searchable: true },
      { _id: 0, slug: 1 },
    )
      .lean()
      .exec();
    return rows
      .map((row) => (row as { slug?: unknown }).slug)
      .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
  },

  /** Public, crawlable category slugs — same visibility rule as `publicCategoryFilter`. */
  async listPublicCategorySlugs(): Promise<string[]> {
    const rows = await CategoryModel.find({ status: "Active" }, { _id: 0, slug: 1 }).lean().exec();
    return rows
      .map((row) => (row as { slug?: unknown }).slug)
      .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
  },

  /** Public, crawlable brand slugs — same visibility rule as `listBrands`. */
  async listPublicBrandSlugs(): Promise<string[]> {
    const rows = await BrandModel.find({ status: "Active" }, { _id: 0, slug: 1 }).lean().exec();
    return rows
      .map((row) => (row as { slug?: unknown }).slug)
      .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
  },

  async listApprovedReviews(
    productId: string,
    params: { page?: number; pageSize?: number },
  ): Promise<PublicListResult<IReview>> {
    const { page, pageSize, skip, limit } = parsePagination(params, 20, 50);
    const filter = { product: productId, status: "Approved" as const };
    const [items, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customer", "name")
        .lean()
        .exec(),
      ReviewModel.countDocuments(filter).exec(),
    ]);
    return { items: items as unknown as IReview[], meta: paginationMeta(total, page, pageSize) };
  },

  /** Active banners within their scheduled window, sorted for a homepage slider. */
  async listActiveBanners(): Promise<IBanner[]> {
    const now = new Date();
    const filter = {
      status: "Active",
      $and: [
        { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      ],
    };
    return (await BannerModel.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate("image", "url alt mimeType")
      .lean()
      .exec()) as unknown as IBanner[];
  },

  /** Public search suggestions drawn from product names/skus and category/brand names. */
  async searchSuggestions(q: string, limit: number): Promise<string[]> {
    if (!q) return [];
    const regex = new RegExp(escapeRegExp(q), "i");
    const [products, categories, brands] = await Promise.all([
      ProductModel.find(
        { status: "Active", searchable: true, name: { $regex: regex } },
        { _id: 0, name: 1 },
      )
        .limit(limit)
        .lean()
        .exec(),
      CategoryModel.find({ status: "Active", name: { $regex: regex } }, { _id: 0, name: 1 })
        .limit(limit)
        .lean()
        .exec(),
      BrandModel.find({ status: "Active", name: { $regex: regex } }, { _id: 0, name: 1 })
        .limit(limit)
        .lean()
        .exec(),
    ]);
    const set = new Set<string>();
    for (const item of [...products, ...categories, ...brands]) {
      if (typeof item.name === "string" && item.name) set.add(item.name);
    }
    return Array.from(set).slice(0, limit);
  },
};
