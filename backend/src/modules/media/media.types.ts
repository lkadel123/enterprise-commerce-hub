import type { IMedia, IVariant } from "./media.model.js";

/** A generated responsive/WebP derivative included in media DTOs. */
export interface VariantDto {
  storageKey: string;
  url: string;
  width: number;
  height: number;
  mimeType: IMedia["mimeType"];
  size: number;
}

export interface MediaDto {
  id: string;
  filename: string;
  originalName: string;
  mimeType: IMedia["mimeType"];
  size: number;
  url: string;
  alt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  variants: VariantDto[];
}
export interface CreateMediaInput {
  filename: string;
  originalName: string;
  mimeType: IMedia["mimeType"];
  size: number;
  url: string;
  storageKey: string;
  createdBy: string;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  variants: IVariant[];
}
export interface UpdateMediaInput {
  alt?: string | null;
}
