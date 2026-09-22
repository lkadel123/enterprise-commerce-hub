import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose, { Types } from "mongoose";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, seedCatalog } from "./helpers/fixtures.js";
import { MediaModel } from "../src/modules/media/media.model.js";
import { ProductModel } from "../src/modules/products/product.model.js";
import * as mediaRepositoryModule from "../src/modules/media/media.repository.js";

/** Phase 9B — public-catalog image enrichment + batched media lookup. */
const app = getApp();

interface SeedVariant {
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/webp";
}

async function seedMedia(url: string, variants: SeedVariant[]) {
  const base = variants[0] ?? { width: 640, height: 480, mimeType: "image/jpeg" as const };
  return MediaModel.create({
    filename: url.split("/").pop() ?? "img.jpg",
    originalName: "img.jpg",
    mimeType: "image/jpeg",
    size: 1000,
    url,
    storageKey: `2026-08/${url.split("/").pop() ?? "img.jpg"}`,
    alt: "catalog image",
    width: base.width,
    height: base.height,
    aspectRatio: base.width / base.height,
    variants: variants.map((v) => ({
      storageKey: `2026-08/v-${v.width}.${v.mimeType === "image/webp" ? "webp" : "jpg"}`,
      url: `/media-files/2026-08/v-${v.width}.${v.mimeType === "image/webp" ? "webp" : "jpg"}`,
      width: v.width,
      height: v.height,
      mimeType: v.mimeType,
      size: 100,
    })),
    createdBy: new mongoose.Types.ObjectId(),
  });
}

async function seedProduct(opts: {
  category: { _id: Types.ObjectId };
  brand: { _id: Types.ObjectId };
  slug: string;
  sku: string;
  name: string;
  images: { url: string; alt?: string; position?: number }[];
}) {
  return ProductModel.create({
    name: opts.name,
    slug: opts.slug,
    sku: opts.sku,
    price: 10,
    cost: 5,
    status: "Active",
    category: opts.category._id,
    brand: opts.brand._id,
    images: opts.images,
  });
}

beforeAll(async () => {
  await connect();
});
beforeEach(async () => {
  await clearDatabase();
});
afterAll(async () => {
  await disconnect();
});

describe("Public catalog media enrichment (Phase 9B)", () => {
  it("enriches Media-backed images with width/height/variants and keeps url/alt/position", async () => {
    const { category, brand } = await seedCatalog();
    const mediaUrl = "/media-files/catalog-hero.jpg";
    await seedMedia(mediaUrl, [{ width: 320, height: 240, mimeType: "image/jpeg" }]);

    await seedProduct({
      category,
      brand,
      slug: "enriched-monitor",
      sku: "ENR-1",
      name: "Enriched Monitor",
      images: [{ url: mediaUrl, alt: "hero", position: 0 }],
    });
    await seedProduct({
      category,
      brand,
      slug: "plain-monitor",
      sku: "PLN-1",
      name: "Plain Monitor",
      images: [{ url: "/external/plain.png", alt: "external", position: 1 }],
    });

    const rich = await request(app).get("/api/v1/public/products/enriched-monitor");
    expect(rich.status).toBe(200);
    const img = rich.body.data.images[0];
    // backward-compatible base fields preserved
    expect(img.url).toBe(mediaUrl);
    expect(img.alt).toBe("hero");
    expect(img.position).toBe(0);
    // additive enrichment
    expect(img.width).toBe(320);
    expect(img.height).toBe(240);
    expect(img.variants).toHaveLength(1);
    expect(img.variants[0].width).toBe(320);

    // An image with no matching Media record is untouched.
    const plain = await request(app).get("/api/v1/public/products/plain-monitor");
    expect(plain.status).toBe(200);
    const pimg = plain.body.data.images[0];
    expect(pimg.url).toBe("/external/plain.png");
    expect(pimg.alt).toBe("external");
    expect(pimg.position).toBe(1);
    expect(pimg.width).toBeUndefined();
    expect(pimg.height).toBeUndefined();
    expect(pimg.variants).toBeUndefined();
  });
});

describe("Media batching / no N+1 (Phase 9B)", () => {
  it("fetches media for several product images in a single batched lookup", async () => {
    const { category, brand } = await seedCatalog();
    const urls = ["/media-files/u1.jpg", "/media-files/u2.jpg", "/media-files/u3.jpg"];
    for (const url of urls) {
      await seedMedia(url, [{ width: 320, height: 240, mimeType: "image/jpeg" }]);
    }
    await seedProduct({
      category,
      brand,
      slug: "batched-product",
      sku: "BAT-1",
      name: "Batched Product",
      images: urls.map((url) => ({ url })),
    });

    const spy = vi.spyOn(mediaRepositoryModule.mediaRepository, "findByUrls");
    try {
      const res = await request(app).get("/api/v1/public/products/batched-product");
      expect(res.status).toBe(200);
      const images = res.body.data.images;
      expect(images).toHaveLength(3);
      for (const im of images) {
        expect(im.width).toBe(320); // every url resolved by the batched lookup
      }
      // One batched query for all three urls, never one query per image.
      expect(spy).toHaveBeenCalledTimes(1);
      expect((spy.mock.calls[0][0] as string[]).slice().sort()).toEqual(urls.slice().sort());
    } finally {
      spy.mockRestore();
    }
  });
});
