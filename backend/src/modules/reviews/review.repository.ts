import { Types } from "mongoose";
import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { ReviewModel, type IReview } from "./review.model.js";
import { ProductModel } from "../products/product.model.js";
import type { ReviewRecord, ReviewStatsDto } from "./review.types.js";

export interface ReviewListParams {
  q?: string;
  status?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}

export interface ReviewListResult {
  items: ReviewRecord[];
  meta: PaginationMeta;
}

interface AvgRow {
  average: number | null;
  count: number;
}

interface DistRow {
  _id: number | null;
  count: number;
}

const productRatingLocks = new Map<string, Promise<void>>();

async function syncProductRating(
  productId: Types.ObjectId | string | null | undefined,
): Promise<void> {
  if (!productId) return;
  const key = productId.toString();

  const previous = productRatingLocks.get(key) ?? Promise.resolve();
  const run = previous.then(async () => {
    const rows = await ReviewModel.aggregate<{ average: number | null; count: number }>([
      { $match: { product: new Types.ObjectId(key), status: "Approved" } },
      { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]).exec();
    const rating = rows[0]?.average ?? 0;
    const reviewsCount = rows[0]?.count ?? 0;
    await ProductModel.updateOne({ _id: key }, { rating, reviewsCount }).exec();
  });
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  productRatingLocks.set(key, tail);
  try {
    await run;
  } finally {
    if (productRatingLocks.get(key) === tail) productRatingLocks.delete(key);
  }
}

export const reviewRepository = {
  async list(params: ReviewListParams): Promise<ReviewListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);

    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = [{ body: { $regex: regex } }, { title: { $regex: regex } }];
    }
    if (params.status) filter.status = params.status;
    if (params.productId) filter.product = params.productId;

    const [items, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customer", "name")
        .populate("product", "name")
        .lean()
        .exec(),
      ReviewModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items as unknown as ReviewRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async setStatus(id: string, status: ReviewRecord["status"]): Promise<void> {
    const review = await ReviewModel.findById(id).select("product").lean().exec();
    if (!review) return;
    await ReviewModel.findByIdAndUpdate(id, { status }, { runValidators: true }).exec();
    await syncProductRating(review.product);
  },

  async findByIdPopulated(id: string): Promise<ReviewRecord | null> {
    return (await ReviewModel.findById(id)
      .populate("customer", "name")
      .populate("product", "name")
      .lean()
      .exec()) as unknown as ReviewRecord | null;
  },

  async deleteById(id: string): Promise<void> {
    const review = await ReviewModel.findById(id).select("product").lean().exec();
    if (!review) return;
    await ReviewModel.findByIdAndDelete(id).exec();
    await syncProductRating(review.product);
  },

  async create(data: {
    customer: Types.ObjectId;
    product: Types.ObjectId;
    rating: number;
    title?: string;
    body: string;
  }): Promise<IReview> {
    const doc = await ReviewModel.create({
      ...data,
      helpfulCount: 0,
      status: "Pending",
    });
    return doc.toObject() as unknown as IReview;
  },

  async findByCustomerAndProduct(customerId: string, productId: string): Promise<IReview | null> {
    return (await ReviewModel.findOne({
      customer: customerId,
      product: productId,
    })
      .lean()
      .exec()) as unknown as IReview | null;
  },

  async listByCustomer(
    customerId: string,
    params: { page?: number; pageSize?: number },
  ): Promise<ReviewListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);
    const filter = { customer: new Types.ObjectId(customerId) };
    const [items, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customer", "name")
        .populate("product", "name")
        .lean()
        .exec(),
      ReviewModel.countDocuments(filter).exec(),
    ]);
    return {
      items: items as unknown as ReviewRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },

  async stats(): Promise<ReviewStatsDto> {
    const [total, pending, avgRows, distRows] = await Promise.all([
      ReviewModel.countDocuments({}).exec(),
      ReviewModel.countDocuments({ status: "Pending" }).exec(),
      ReviewModel.aggregate<AvgRow>([
        { $match: { status: "Approved" } },
        { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]).exec(),
      ReviewModel.aggregate<DistRow>([{ $group: { _id: "$rating", count: { $sum: 1 } } }]).exec(),
    ]);

    const distribution = distRows.reduce<Record<number, number>>((acc, row) => {
      if (row._id != null) acc[row._id] = row.count;
      return acc;
    }, {});

    return {
      average: avgRows[0]?.average ?? 0,
      total,
      pending,
      distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: distribution[stars] ?? 0 })),
    };
  },
};
