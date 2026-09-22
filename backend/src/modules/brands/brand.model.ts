import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { slugify } from "../../utils/slugify.js";

export const BRAND_STATUSES = ["Active", "Hidden"] as const;
export type BrandStatus = (typeof BRAND_STATUSES)[number];

export interface IBrand {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  status: BrandStatus;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, maxlength: 500 },
    logoUrl: { type: String },
    status: { type: String, enum: [...BRAND_STATUSES], default: "Active" },
  },
  { timestamps: true, versionKey: false },
);

brandSchema.pre("validate", function (this: IBrand, next) {
  if (!this.slug) this.slug = slugify(this.name);
  next();
});

export type BrandDoc = HydratedDocument<IBrand>;

export const BrandModel = model<IBrand>("Brand", brandSchema);
