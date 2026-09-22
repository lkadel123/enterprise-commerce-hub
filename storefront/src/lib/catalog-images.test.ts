import { describe, expect, it } from "vitest";

import { leadImage, MAX_GALLERY_IMAGES, normalizeProductImages } from "./catalog-images";
import type { ProductImage } from "@/types";

function image(url: string | null, alt?: string): ProductImage {
  return { url: url as string, ...(alt ? { alt } : {}) } as ProductImage;
}

describe("normalizeProductImages", () => {
  it("returns an empty array for null/undefined input", () => {
    expect(normalizeProductImages(null)).toEqual([]);
    expect(normalizeProductImages(undefined)).toEqual([]);
  });

  it("passes through images in the existing order", () => {
    const src = [image("/a.webp"), image("/b.webp"), image("/c.webp")];
    const result = normalizeProductImages(src);
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.url)).toEqual(["/a.webp", "/b.webp", "/c.webp"]);
  });

  it(`caps at ${MAX_GALLERY_IMAGES} images`, () => {
    const src = Array.from({ length: 6 }, (_, i) => image(`/img-${i + 1}.webp`));
    const result = normalizeProductImages(src);
    expect(result).toHaveLength(MAX_GALLERY_IMAGES);
    expect(result[0]?.url).toBe("/img-1.webp");
  });

  it("drops entries without a usable url", () => {
    const src = [image("/a.webp"), image(null), image("   ")] as ProductImage[];
    const result = normalizeProductImages(src);
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("/a.webp");
  });

  it("silently de-duplicates repeated urls", () => {
    const src = [image("/a.webp"), image("/a.webp"), image("/b.webp")];
    const result = normalizeProductImages(src);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.url)).toEqual(["/a.webp", "/b.webp"]);
  });

  it("trims surrounding whitespace from urls before deduping", () => {
    const src = [image(" /a.webp "), image("/a.webp")];
    const result = normalizeProductImages(src);
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("/a.webp");
  });
});

describe("leadImage", () => {
  it("returns the first usable image", () => {
    const src = [image("/a.webp"), image("/b.webp")];
    expect(leadImage(src)?.url).toBe("/a.webp");
  });

  it("returns undefined when the product has no usable image", () => {
    expect(leadImage([])).toBeUndefined();
    expect(leadImage(null)).toBeUndefined();
    expect(leadImage([image(null)])).toBeUndefined();
  });
});
