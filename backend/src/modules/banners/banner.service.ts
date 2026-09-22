import { badRequest, notFound } from "../../utils/ApiError.js";
import { mediaRepository } from "../media/media.repository.js";
import { bannerRepository, type BannerListParams } from "./banner.repository.js";
import type {
  BannerRecord,
  BannerDto,
  CreateBannerInput,
  UpdateBannerInput,
} from "./banner.types.js";

function toDto(banner: BannerRecord): BannerDto {
  return {
    id: banner._id.toString(),
    title: banner.title,
    image: {
      id: banner.image._id.toString(),
      url: banner.image.url,
      alt: banner.image.alt,
      mimeType: banner.image.mimeType,
    },
    linkUrl: banner.linkUrl,
    status: banner.status,
    startAt: banner.startAt ? new Date(banner.startAt).toISOString() : null,
    endAt: banner.endAt ? new Date(banner.endAt).toISOString() : null,
    sortOrder: banner.sortOrder,
    createdBy: banner.createdBy.toString(),
    createdAt: new Date(banner.createdAt).toISOString(),
    updatedAt: new Date(banner.updatedAt).toISOString(),
  };
}

async function ensureImage(imageId: string): Promise<void> {
  if (!(await mediaRepository.findById(imageId)))
    throw notFound("Banner image media was not found.");
}
function assertDateRange(startAt: Date | null, endAt: Date | null): void {
  if (startAt && endAt && endAt.getTime() <= startAt.getTime())
    throw badRequest("endAt must be after startAt");
}

export const bannerService = {
  async list(params: BannerListParams) {
    const result = await bannerRepository.list(params);
    return { items: result.items.map(toDto), meta: result.meta };
  },
  async getById(id: string): Promise<BannerDto> {
    const banner = await bannerRepository.findById(id);
    if (!banner) throw notFound("Banner not found.");
    return toDto(banner);
  },
  async create(input: CreateBannerInput, actorId: string): Promise<BannerDto> {
    await ensureImage(input.imageId);
    assertDateRange(input.startAt ?? null, input.endAt ?? null);
    const created = await bannerRepository.create({ ...input, createdBy: actorId });
    return bannerService.getById(created._id.toString());
  },
  async update(id: string, input: UpdateBannerInput): Promise<BannerDto> {
    const existing = await bannerRepository.findById(id);
    if (!existing) throw notFound("Banner not found.");
    if (input.imageId) await ensureImage(input.imageId);
    assertDateRange(
      input.startAt === undefined ? existing.startAt : input.startAt,
      input.endAt === undefined ? existing.endAt : input.endAt,
    );
    const updated = await bannerRepository.updateById(id, input);
    if (!updated) throw notFound("Banner not found.");
    return bannerService.getById(id);
  },
  async remove(id: string): Promise<void> {
    if (!(await bannerRepository.deleteById(id))) throw notFound("Banner not found.");
  },
};
