import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { slugify } from "../../utils/slugify.js";
import type { IVariant } from "../media/media.model.js";

export const PRODUCT_STATUSES = ["Active", "Draft", "Out of Stock", "Archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const SHIPPING_CLASSES = ["standard", "bulky", "fragile"] as const;
export type ShippingClass = (typeof SHIPPING_CLASSES)[number];

export interface IProductVariation {
  size?: string;
  color?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

export interface IProductImage {
  url: string;
  alt?: string;
  position?: number;
  /**
   * Populated for images backed by the Media library (Phase 9B). Optional and
   * additive — external/legacy image URLs continue to expose `url` only.
   */
  width?: number;
  height?: number;
  variants?: IVariant[];
}

export interface IProductShipping {
  weightKg?: number;
  shippingClass?: ShippingClass;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface IProductSeo {
  title?: string;
  slug?: string;
  metaDescription?: string;
  keywords?: string;
}

export interface IProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  sku: string;
  description?: string;
  category: Types.ObjectId | null;
  brand: Types.ObjectId | null;
  price: number;
  cost: number;
  status: ProductStatus;
  rating: number;
  reviewsCount: number;
  featured: boolean;
  searchable: boolean;
  images: IProductImage[];
  variations: IProductVariation[];
  shipping: IProductShipping;
  seo: IProductSeo;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 64 },
    description: { type: String, maxlength: 4000 },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    brand: { type: Schema.Types.ObjectId, ref: "Brand", default: null, index: true },
    price: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    status: { type: String, enum: [...PRODUCT_STATUSES], default: "Draft", index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewsCount: { type: Number, default: 0, min: 0 },
    featured: { type: Boolean, default: false },
    searchable: { type: Boolean, default: true },
    images: [
      {
        url: { type: String, required: true },
        alt: { type: String },
        position: { type: Number },
      },
    ],
    variations: [
      {
        size: { type: String },
        color: { type: String },
        sku: { type: String },
        price: { type: Number },
        stock: { type: Number },
      },
    ],
    shipping: {
      weightKg: { type: Number },
      shippingClass: { type: String, enum: [...SHIPPING_CLASSES] },
      lengthCm: { type: Number },
      widthCm: { type: Number },
      heightCm: { type: Number },
    },
    seo: {
      title: { type: String },
      slug: { type: String },
      metaDescription: { type: String },
      keywords: { type: String },
    },
  },
  { timestamps: true, versionKey: false },
);

productSchema.pre("validate", function (this: IProduct, next) {
  if (!this.slug) this.slug = slugify(this.name);
  next();
});

productSchema.index({ name: "text", sku: "text" });

export type ProductDoc = HydratedDocument<IProduct>;

export const ProductModel = model<IProduct>("Product", productSchema);
