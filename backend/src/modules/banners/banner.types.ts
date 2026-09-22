import type { BannerStatus, IBanner } from "./banner.model.js";
import type { IMedia } from "../media/media.model.js";

export interface BannerImageDto {
  id: string;
  url: string;
  alt: string | null;
  mimeType: string;
}
export interface BannerDto {
  id: string;
  title: string;
  image: BannerImageDto;
  linkUrl: string | null;
  status: BannerStatus;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface CreateBannerInput {
  title: string;
  imageId: string;
  linkUrl?: string | null;
  status?: BannerStatus;
  startAt?: Date | null;
  endAt?: Date | null;
  sortOrder?: number;
}
export type UpdateBannerInput = Partial<CreateBannerInput>;
export interface BannerRecord extends Omit<IBanner, "image"> {
  image: IMedia;
}
