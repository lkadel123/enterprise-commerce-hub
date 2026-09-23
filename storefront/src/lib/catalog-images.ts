import type { ProductImage } from "@/types";

/**
 * Maximum number of product images rendered in a gallery / card.
 */
export const MAX_GALLERY_IMAGES = 4;

/**
 * Normalize a product's image list for display.
 *
 * - Accepts the backend's `images[]` structure (the only image shape exposed by
 *   the public catalog API — primary + additional media bundled in one array).
 * - Drops entries without a usable URL and silently de-duplicates repeated
 *   URLs so the gallery never shows duplicated thumbnails.
 * - Caps the result at {@link MAX_GALLERY_IMAGES} images, honouring the
 *   existing product ordering (first four are shown).
 *
 * Every component that renders product imagery consumes this helper so the
 * image-index logic lives in exactly one place.
 */
export function normalizeProductImages(images: ProductImage[] | null | undefined): ProductImage[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();
  const result: ProductImage[] = [];

  for (const img of images) {
    if (result.length >= MAX_GALLERY_IMAGES) break;
    if (!img || typeof img.url !== "string" || img.url.trim() === "") continue;
    const url = img.url.trim();
    if (seen.has(url)) continue;
    seen.add(url);
    // Store the trimmed url so consumers never render whitespace-padded srcs.
    result.push(url === img.url ? img : { ...img, url });
  }

  return result;
}

/** First usable display image (or `undefined` when the product has none). */
export function leadImage(images: ProductImage[] | null | undefined): ProductImage | undefined {
  return normalizeProductImages(images)[0];
}
