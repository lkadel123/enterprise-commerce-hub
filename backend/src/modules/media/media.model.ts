import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/**
 * A generated image derivative (responsive variant or WebP fallback).
 * Stored alongside the original; never replaces it.
 */
export interface IVariant {
  storageKey: string;
  url: string;
  width: number;
  height: number;
  mimeType: ImageMimeType;
  size: number;
}

export interface IMedia {
  _id: Types.ObjectId;
  filename: string;
  originalName: string;
  mimeType: ImageMimeType;
  size: number;
  url: string;
  storageKey: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  variants: IVariant[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const variantSchema = new Schema<IVariant>(
  {
    storageKey: { type: String, required: true, maxlength: 200 },
    url: { type: String, required: true, maxlength: 1000 },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true, enum: [...IMAGE_MIME_TYPES] },
    size: { type: Number, required: true, min: 1 },
  },
  { _id: false, versionKey: false },
);

const mediaSchema = new Schema<IMedia>(
  {
    filename: { type: String, required: true, unique: true, maxlength: 160 },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, enum: [...IMAGE_MIME_TYPES] },
    size: { type: Number, required: true, min: 1 },
    url: { type: String, required: true, maxlength: 1000 },
    storageKey: { type: String, required: true, unique: true, maxlength: 200 },
    alt: { type: String, default: null, maxlength: 200 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    aspectRatio: { type: Number, default: null },
    variants: { type: [variantSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

mediaSchema.index({ createdAt: -1 });
mediaSchema.index({ mimeType: 1, createdAt: -1 });
export type MediaDoc = HydratedDocument<IMedia>;
export const MediaModel = model<IMedia>("Media", mediaSchema);
