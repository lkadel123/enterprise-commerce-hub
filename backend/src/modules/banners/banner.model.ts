import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const BANNER_STATUSES = ["Active", "Inactive"] as const;
export type BannerStatus = (typeof BANNER_STATUSES)[number];
export interface IBanner {
  _id: Types.ObjectId;
  title: string;
  image: Types.ObjectId;
  linkUrl: string | null;
  status: BannerStatus;
  startAt: Date | null;
  endAt: Date | null;
  sortOrder: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
const bannerSchema = new Schema<IBanner>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    image: { type: Schema.Types.ObjectId, ref: "Media", required: true },
    linkUrl: { type: String, default: null, maxlength: 500 },
    status: { type: String, enum: [...BANNER_STATUSES], default: "Inactive", required: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    sortOrder: { type: Number, required: true, default: 0, min: 0, max: 1000000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);
bannerSchema.index({ status: 1, sortOrder: 1, createdAt: -1 });
bannerSchema.index({ startAt: 1, endAt: 1 });
export type BannerDoc = HydratedDocument<IBanner>;
export const BannerModel = model<IBanner>("Banner", bannerSchema);
