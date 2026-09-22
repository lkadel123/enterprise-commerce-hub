import { randomUUID } from "node:crypto";
import path from "node:path";
import { badRequest, conflict, notFound } from "../../utils/ApiError.js";
import { env } from "../../config/env.js";
import { mediaStorage } from "../../storage/mediaStorage.js";
import { bannerRepository } from "../banners/banner.repository.js";
import { processImage, VARIANT_WIDTHS, type ProcessedImage } from "../../storage/imageProcessor.js";
import { IMAGE_MIME_TYPES, type IMedia, type IVariant, type ImageMimeType } from "./media.model.js";
import { ProductModel } from "../products/product.model.js";
import { mediaRepository, type MediaListParams } from "./media.repository.js";
import type { MediaDto, UpdateMediaInput } from "./media.types.js";

const extensionByMime: Record<ImageMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function hasValidImageSignature(content: Buffer, mimeType: ImageMimeType): boolean {
  if (mimeType === "image/jpeg")
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mimeType === "image/png")
    return (
      content.length >= 8 &&
      content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  return (
    content.length >= 12 &&
    content.subarray(0, 4).toString("ascii") === "RIFF" &&
    content.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function variantExtFor(mimeType: ImageMimeType): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function toDto(media: IMedia): MediaDto {
  return {
    id: media._id.toString(),
    filename: media.filename,
    originalName: media.originalName,
    mimeType: media.mimeType,
    size: media.size,
    url: media.url,
    alt: media.alt,
    createdBy: media.createdBy.toString(),
    createdAt: new Date(media.createdAt).toISOString(),
    updatedAt: new Date(media.updatedAt).toISOString(),
    width: media.width ?? null,
    height: media.height ?? null,
    aspectRatio: media.aspectRatio ?? null,
    variants: (media.variants ?? []).map((v) => ({
      storageKey: v.storageKey,
      url: v.url,
      width: v.width,
      height: v.height,
      mimeType: v.mimeType,
      size: v.size,
    })),
  };
}

export const mediaService = {
  async list(params: MediaListParams) {
    const result = await mediaRepository.list(params);
    return { items: result.items.map(toDto), meta: result.meta };
  },
  async getById(id: string): Promise<MediaDto> {
    const media = await mediaRepository.findById(id);
    if (!media) throw notFound("Media not found.");
    return toDto(media);
  },
  async create(file: Express.Multer.File, actorId: string): Promise<MediaDto> {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype))
      throw badRequest("Only JPEG, PNG, and WebP images are allowed.");
    const mimeType = file.mimetype as ImageMimeType;
    if (!hasValidImageSignature(file.buffer, mimeType))
      throw badRequest("The uploaded file is not a valid image.");

    const filename = `${randomUUID()}.${extensionByMime[mimeType]}`;
    const storageKey = `${new Date().toISOString().slice(0, 7)}/${filename}`;
    const originalName = path.basename(file.originalname).slice(0, 255) || filename;

    // Detect dimensions + decompression-bomb guard + generate EXIF-stripped derivatives.
    // The original bytes are preserved separately below (never transcoded).
    let processed: ProcessedImage;
    try {
      processed = await processImage(file.buffer, mimeType, {
        widths: [...VARIANT_WIDTHS],
        maxPixels: env.MEDIA_MAX_IMAGE_PIXELS,
      });
    } catch {
      throw badRequest(
        "The uploaded file is not a decodable image or exceeds the allowed dimensions.",
      );
    }

    // Persist the original byte-for-byte (format preserved, EXIF retained).
    const url = await mediaStorage.store(storageKey, file.buffer);

    const variants: IVariant[] = [];
    const storedKeys: string[] = [];
    try {
      for (const v of processed.variants) {
        const ext = variantExtFor(v.mimeType);
        const dir = path.posix.dirname(storageKey);
        const stem = path.posix.basename(storageKey, `.${extensionByMime[mimeType]}`);
        const variantKey = `${dir}/${stem}-w${v.width}.${ext}`;
        const variantUrl = await mediaStorage.store(variantKey, v.buffer);
        variants.push({
          storageKey: variantKey,
          url: variantUrl,
          width: v.width,
          height: v.height,
          mimeType: v.mimeType,
          size: v.buffer.length,
        });
        storedKeys.push(variantKey);
      }

      return toDto(
        await mediaRepository.create({
          filename,
          originalName,
          mimeType,
          size: file.size,
          url,
          storageKey,
          width: processed.width,
          height: processed.height,
          aspectRatio: processed.aspectRatio,
          variants,
          createdBy: actorId,
        }),
      );
    } catch (error) {
      // On any failure, remove the original and any variants already written so
      // no orphan files are left behind.
      await Promise.allSettled([...storedKeys, storageKey].map((key) => mediaStorage.remove(key)));
      throw error;
    }
  },
  async update(id: string, input: UpdateMediaInput): Promise<MediaDto> {
    const updated = await mediaRepository.updateById(id, input);
    if (!updated) throw notFound("Media not found.");
    return toDto(updated);
  },
  async remove(id: string): Promise<void> {
    const media = await mediaRepository.findById(id);
    if (!media) throw notFound("Media not found.");
    if (await bannerRepository.isMediaReferenced(id))
      throw conflict("Media is used by a banner and cannot be deleted.");
    // Phase 14 — reference safety: product images store Media URLs as strings,
    // so a delete would silently break live storefront image URLs. Block the
    // delete while any product references the image (or its variants).
    const productRefCount = await ProductModel.countDocuments({
      $or: [
        { "images.url": media.url },
        ...((media.variants ?? []).length > 0
          ? [{ "images.url": { $in: media.variants.map((v) => v.url) } }]
          : []),
      ],
    }).exec();
    if (productRefCount > 0) {
      throw conflict(
        `Media is referenced by ${productRefCount} product image(s) and cannot be deleted.`,
      );
    }
    const deleted = await mediaRepository.deleteById(id);
    if (!deleted) throw notFound("Media not found.");
    // Remove the original AND every generated variant; never touch other records.
    const variantKeys = (deleted.variants ?? []).map((v) => v.storageKey);
    await Promise.allSettled([
      mediaStorage.remove(deleted.storageKey),
      ...variantKeys.map((key) => mediaStorage.remove(key)),
    ]);
  },
};
