import type { Types } from "mongoose";
import type { IReview } from "./review.model.js";

export interface ReviewRef {
  _id: Types.ObjectId;
  name: string;
}

export interface ReviewRecord extends Omit<IReview, "customer" | "product"> {
  customer: ReviewRef | null;
  product: ReviewRef | null;
}

export interface ReviewDto {
  id: string;
  customer: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  rating: number;
  title: string | null;
  body: string;
  helpfulCount: number;
  status: IReview["status"];
  createdAt: string;
}

export interface ReviewStatsDto {
  average: number;
  total: number;
  pending: number;
  distribution: { stars: number; count: number }[];
}
