import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const REVIEW_STATUSES = ["Approved", "Pending", "Rejected", "Hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface IReview {
  _id: Types.ObjectId;
  customer: Types.ObjectId;
  product: Types.ObjectId;
  rating: number;
  title?: string;
  body: string;
  helpfulCount: number;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    helpfulCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: [...REVIEW_STATUSES], default: "Pending" },
  },
  { timestamps: true, versionKey: false },
);

reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ status: 1, createdAt: -1 });
// A customer may review a given product only once (Phase 7 duplicate protection).
reviewSchema.index({ customer: 1, product: 1 }, { unique: true });

export type ReviewDoc = HydratedDocument<IReview>;

export const ReviewModel = model<IReview>("Review", reviewSchema);
