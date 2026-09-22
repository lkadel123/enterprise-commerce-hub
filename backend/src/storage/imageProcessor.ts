import sharp from "sharp";
import type { ImageMimeType } from "../modules/media/media.model.js";

/** Responsive widths generated for every uploaded image (never upscaled). */
export const VARIANT_WIDTHS = [320, 640, 1024, 1600] as const;

/** Default upper bound on decoded pixels — guards against decompression bombs. */
export const DEFAULT_MAX_IMAGE_PIXELS = 60_000_000;

export interface ResizedVariant {
  width: number;
  height: number;
  mimeType: ImageMimeType;
  buffer: Buffer;
}

export interface ProcessedImage {
  width: number;
  height: number;
  aspectRatio: number;
  /** EXIF/metadata-stripped derivatives (WebP + original-format fallbacks). */
  variants: ResizedVariant[];
}

export interface ProcessOptions {
  widths?: readonly number[];
  maxPixels?: number;
  jpegQuality?: number;
  webpQuality?: number;
}

/**
 * Decodes the source image, validates its dimensions against `maxPixels`
 * (decompression-bomb protection) and generates EXIF-stripped derivatives.
 *
 * - The original buffer is never consumed/transcoded here (preservation is
 *   handled by the caller, which stores the original bytes verbatim).
 * - Variants are produced at each requested width ≤ the source width (no upscaling).
 * - Each width yields a WebP derivative plus an original-format fallback
 *   (jpeg/png). A WebP source only yields WebP derivatives (its originals are
 *   already modern).
 */
export async function processImage(
  input: Buffer,
  mimeType: ImageMimeType,
  options: ProcessOptions = {},
): Promise<ProcessedImage> {
  const widths = options.widths ? [...options.widths] : [...VARIANT_WIDTHS];
  const maxPixels = options.maxPixels ?? DEFAULT_MAX_IMAGE_PIXELS;
  const jpegQuality = options.jpegQuality ?? 82;
  const webpQuality = options.webpQuality ?? 80;

  // `limitInputPixels` makes libvips abort a hostile oversized decode early.
  const metadata = await sharp(input, { limitInputPixels: maxPixels }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unable to determine image dimensions.");
  }

  const width = metadata.width;
  const height = metadata.height;
  if (width <= 0 || height <= 0) throw new Error("Invalid image dimensions.");
  if (width * height > maxPixels) {
    throw new Error("Image exceeds the maximum allowed pixel count.");
  }

  const variants: ResizedVariant[] = [];
  for (const targetWidth of widths) {
    if (targetWidth >= width) continue; // never generate a variant wider than the source

    // WebP derivative (modern browsers). `.rotate()` auto-orients from EXIF and
    // the re-encode drops all metadata by design (EXIF stripped from derivatives).
    const webpBuffer = await sharp(input)
      .rotate()
      .resize({ width: targetWidth, withoutEnlargement: true, fit: "inside" })
      .webp({ quality: webpQuality, lossless: false })
      .toBuffer();
    const webpMeta = await sharp(webpBuffer).metadata();
    variants.push({
      width: webpMeta.width ?? targetWidth,
      height: webpMeta.height ?? 0,
      mimeType: "image/webp",
      buffer: webpBuffer,
    });

    // Original-format fallback for browsers without WebP support.
    if (mimeType !== "image/webp") {
      const fallback = sharp(input)
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true, fit: "inside" });
      const fallbackBuffer =
        mimeType === "image/jpeg"
          ? await fallback.jpeg({ quality: jpegQuality }).toBuffer()
          : await fallback.png({ quality: jpegQuality }).toBuffer();
      const fbMeta = await sharp(fallbackBuffer).metadata();
      variants.push({
        width: fbMeta.width ?? targetWidth,
        height: fbMeta.height ?? 0,
        mimeType,
        buffer: fallbackBuffer,
      });
    }
  }

  const aspectRatio = Math.round((width / height) * 10000) / 10000;
  return { width, height, aspectRatio, variants };
}
