import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { slugify } from "../../utils/slugify.js";

export const CATEGORY_STATUSES = ["Active", "Hidden"] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export interface ICategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  parent: Types.ObjectId | null;
  description?: string;
  sort: number;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    description: { type: String, maxlength: 500 },
    sort: { type: Number, default: 0 },
    status: { type: String, enum: [...CATEGORY_STATUSES], default: "Active" },
  },
  { timestamps: true, versionKey: false },
);

categorySchema.pre("validate", function (this: ICategory, next) {
  if (!this.slug) this.slug = slugify(this.name);
  next();
});

export type CategoryDoc = HydratedDocument<ICategory>;

export const CategoryModel = model<ICategory>("Category", categorySchema);
