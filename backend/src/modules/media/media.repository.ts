import { escapeRegExp } from "../../utils/escapeRegExp.js";
import { paginationMeta, parsePagination, parseSort } from "../../utils/pagination.js";
import type { PaginationMeta } from "../../utils/ApiResponse.js";
import { MediaModel, type IMedia } from "./media.model.js";
import type { CreateMediaInput, UpdateMediaInput } from "./media.types.js";

export interface MediaListParams {
  q?: string;
  mimeType?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}
export interface MediaListResult {
  items: IMedia[];
  meta: PaginationMeta;
}

export const mediaRepository = {
  async list(params: MediaListParams): Promise<MediaListResult> {
    const { page, pageSize, skip, limit } = parsePagination(params);
    const filter: Record<string, unknown> = {};
    if (params.q) {
      const regex = new RegExp(escapeRegExp(params.q), "i");
      filter.$or = ["filename", "originalName", "alt"].map((field) => ({
        [field]: { $regex: regex },
      }));
    }
    if (params.mimeType) filter.mimeType = params.mimeType;
    const sort = parseSort(params.sort, ["filename", "mimeType", "size", "createdAt", "updatedAt"]);
    const sortWithDefault = Object.keys(sort).length > 0 ? sort : { createdAt: -1 as const };
    const [items, total] = await Promise.all([
      MediaModel.find(filter).sort(sortWithDefault).skip(skip).limit(limit).lean().exec(),
      MediaModel.countDocuments(filter).exec(),
    ]);
    return { items: items as unknown as IMedia[], meta: paginationMeta(total, page, pageSize) };
  },
  async findById(id: string): Promise<IMedia | null> {
    return (await MediaModel.findById(id).lean().exec()) as unknown as IMedia | null;
  },
  async create(input: CreateMediaInput): Promise<IMedia> {
    return (await MediaModel.create(input)).toObject() as unknown as IMedia;
  },
  async updateById(id: string, patch: UpdateMediaInput): Promise<IMedia | null> {
    return (await MediaModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .lean()
      .exec()) as unknown as IMedia | null;
  },
  async deleteById(id: string): Promise<IMedia | null> {
    return (await MediaModel.findByIdAndDelete(id).lean().exec()) as unknown as IMedia | null;
  },
  async findByUrls(urls: string[]): Promise<IMedia[]> {
    if (urls.length === 0) return [];
    return (await MediaModel.find({ url: { $in: urls } })
      .lean()
      .exec()) as unknown as IMedia[];
  },
};
