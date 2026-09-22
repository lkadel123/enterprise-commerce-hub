import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { BannerModel, type IBanner } from "./banner.model.js";
import type { CreateBannerInput, UpdateBannerInput, BannerRecord } from "./banner.types.js";

export interface BannerListParams {
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
export interface BannerListResult {
  items: BannerRecord[];
  meta: PaginationMeta;
}
const populateImage = "url alt mimeType";

export const bannerRepository = {
  async list(params: BannerListParams): Promise<BannerListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);
    const filter: Record<string, unknown> = {};
    if (params.q) filter.title = { $regex: new RegExp(escapeRegExp(params.q), "i") };
    if (params.status) filter.status = params.status;
    const sort = parseSort(params.sort, [
      "title",
      "status",
      "sortOrder",
      "startAt",
      "endAt",
      "createdAt",
    ]);
    const sortWithDefault =
      Object.keys(sort).length > 0 ? sort : { sortOrder: 1 as const, createdAt: -1 as const };
    const [items, total] = await Promise.all([
      BannerModel.find(filter)
        .sort(sortWithDefault)
        .skip(skip)
        .limit(limit)
        .populate("image", populateImage)
        .lean()
        .exec(),
      BannerModel.countDocuments(filter).exec(),
    ]);
    return {
      items: items as unknown as BannerRecord[],
      meta: paginationMeta(total, page, pageSize),
    };
  },
  async findById(id: string): Promise<BannerRecord | null> {
    return (await BannerModel.findById(id)
      .populate("image", populateImage)
      .lean()
      .exec()) as unknown as BannerRecord | null;
  },
  async create(input: CreateBannerInput & { createdBy: string }): Promise<IBanner> {
    const { imageId, ...rest } = input;
    return (await BannerModel.create({ ...rest, image: imageId })).toObject() as unknown as IBanner;
  },
  async updateById(id: string, input: UpdateBannerInput): Promise<IBanner | null> {
    const { imageId, ...rest } = input;
    const patch = { ...rest, ...(imageId ? { image: imageId } : {}) };
    return (await BannerModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as IBanner | null;
  },
  async deleteById(id: string): Promise<IBanner | null> {
    return (await BannerModel.findByIdAndDelete(id).lean().exec()) as unknown as IBanner | null;
  },
  async isMediaReferenced(mediaId: string): Promise<boolean> {
    return Boolean(await BannerModel.exists({ image: mediaId }));
  },
};
