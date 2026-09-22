import { InventoryModel } from "../inventory/inventory.model.js";
import {
  paginationMeta,
  parsePagination,
  parseSort,
  type SortMap,
} from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { ProductModel } from "./product.model.js";
import type { IProduct } from "./product.model.js";
import type { CreateProductInput, ProductRecord, UpdateProductInput } from "./product.types.js";

export interface ProductListParams {
  q?: string;
  status?: string;
  category?: string;
  brand?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface ProductListResult {
  items: ProductRecord[];
  meta: PaginationMeta;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const productRepository = {
  async list(params: ProductListParams): Promise<ProductListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ name: { $regex: regex } }, { sku: { $regex: regex } }];
    }
    if (params.status) filter.status = params.status;
    if (params.category) filter.category = params.category;
    if (params.brand) filter.brand = params.brand;

    const sort = parseSort(params.sort, [
      "name",
      "price",
      "cost",
      "rating",
      "reviewsCount",
      "featured",
      "createdAt",
    ]);
    const sortWithDefault: SortMap = Object.keys(sort).length > 0 ? sort : { createdAt: -1 };

    const [items, total] = await Promise.all([
      ProductModel.find(filter)
        .sort(sortWithDefault)
        .skip(skip)
        .limit(limit)
        .populate("category", "name")
        .populate("brand", "name")
        .lean()
        .exec(),
      ProductModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as ProductRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async findByIdPopulated(id: string): Promise<ProductRecord | null> {
    return (await ProductModel.findById(id)
      .populate("category", "name")
      .populate("brand", "name")
      .lean()
      .exec()) as unknown as ProductRecord | null;
  },

  async findById(id: string): Promise<IProduct | null> {
    return (await ProductModel.findById(id).lean().exec()) as unknown as IProduct | null;
  },

  async findBySku(sku: string): Promise<IProduct | null> {
    return (await ProductModel.findOne({ sku: sku.toUpperCase() })
      .lean()
      .exec()) as unknown as IProduct | null;
  },

  async findByIds(ids: string[]): Promise<IProduct[]> {
    if (ids.length === 0) return [];
    return (await ProductModel.find({ _id: { $in: ids } })
      .lean()
      .exec()) as unknown as IProduct[];
  },

  async create(data: CreateProductInput & { slug: string }): Promise<IProduct> {
    const { categoryId, brandId, ...rest } = data;
    const doc = await ProductModel.create({
      ...rest,
      category: categoryId ?? null,
      brand: brandId ?? null,
    });
    return doc.toObject() as unknown as IProduct;
  },

  async updateById(id: string, patch: UpdateProductInput): Promise<IProduct | null> {
    const { categoryId, brandId, ...rest } = patch;
    return (await ProductModel.findByIdAndUpdate(
      id,
      {
        ...rest,
        category: "categoryId" in patch ? (categoryId ?? null) : undefined,
        brand: "brandId" in patch ? (brandId ?? null) : undefined,
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec()) as unknown as IProduct | null;
  },

  async deleteById(id: string): Promise<IProduct | null> {
    return (await ProductModel.findByIdAndDelete(id).lean().exec()) as unknown as IProduct | null;
  },

  async count(): Promise<number> {
    return ProductModel.estimatedDocumentCount().exec();
  },

  /** Aggregate stock / reserved totals from inventory for a batch of products. */
  async inventoryTotals(
    productIds: string[],
  ): Promise<Map<string, { stock: number; reserved: number }>> {
    if (productIds.length === 0) return new Map();
    const rows = await InventoryModel.aggregate<{ _id: string; stock: number; reserved: number }>([
      { $match: { product: { $in: productIds } } },
      {
        $group: {
          _id: "$product",
          stock: { $sum: "$stock" },
          reserved: { $sum: "$reserved" },
        },
      },
    ]).exec();
    return new Map(
      rows.map((row) => [row._id.toString(), { stock: row.stock, reserved: row.reserved }]),
    );
  },
};
