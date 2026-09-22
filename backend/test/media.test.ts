import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { promises as fs, rmSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { connect, clearDatabase, disconnect } from "./helpers/testdb.js";
import { getApp, userTokenFor } from "./helpers/fixtures.js";
import { uploadRoot } from "./helpers/phase9b-test-env.js";
import { mediaStorage } from "../src/storage/mediaStorage.js";
import { MediaModel } from "../src/modules/media/media.model.js";
import { BannerModel } from "../src/modules/banners/banner.model.js";
import { env } from "../src/config/env.js";

/**
 * Phase 9B — media upload, image-variant, EXIF, delete, storage and
 * static-serving integration tests against the real Express app. All requests
 * run against getApp() with an in-memory MongoDB and the real local storage
 * provider (redirected to an OS temp dir by the vitest setup file).
 */
const app = getApp();
let auth: Awaited<ReturnType<typeof userTokenFor>>;
const createdStorageKeys: string[] = [];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function fileExists(p: string): Promise<boolean> {
  return fs
    .stat(p)
    .then(() => true)
    .catch(() => false);
}

/** Deterministic solid-color image of a real format via sharp. */
async function makeImage(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp",
): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 33, g: 67, b: 145 } },
  });
  if (format === "png") return base.png().toBuffer();
  if (format === "webp") return base.webp({ quality: 80 }).toBuffer();
  return base.jpeg({ quality: 85 }).toBuffer();
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** A small-byte PNG whose IHDR claims huge, limit-exceeding dimensions. */
function bombPng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from([0x00]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function upload(file: Buffer, contentType: string, filename: string) {
  return request(app)
    .post("/api/v1/media")
    .set(auth.header)
    .attach("file", file, { filename, contentType });
}

function registerCreated(res: {
  body?: { data?: { url?: string; variants?: { storageKey?: string }[] } };
}) {
  const b = res.body?.data;
  if (!b) return;
  if (b.url) createdStorageKeys.push(storageKeyOf({ url: b.url }));
  for (const v of b.variants ?? []) if (v.storageKey) createdStorageKeys.push(v.storageKey);
}

function variantWidths(b: { variants: { width: number }[] }): number[] {
  return b.variants.map((v) => v.width);
}

/** The media DTO intentionally omits `storageKey`; derive it from the public URL. */
function storageKeyOf(b: { url: string }): string {
  return String(b.url).slice(env.MEDIA_PUBLIC_URL.length + 1);
}

beforeAll(async () => {
  await connect();
});
beforeEach(async () => {
  await clearDatabase();
  createdStorageKeys.length = 0;
  // Auth user must be (re)created after clearDatabase so `authenticate` finds it.
  auth = await userTokenFor("Marketing Manager");
});
afterEach(async () => {
  // Best-effort removal of any files this test created, even on failure.
  await Promise.allSettled(createdStorageKeys.map((k) => mediaStorage.remove(k)));
  createdStorageKeys.length = 0;
});
afterAll(async () => {
  await disconnect();
  rmSync(uploadRoot, { recursive: true, force: true });
});

describe("Phase 9B media upload", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/v1/media").attach("file", Buffer.from("x"), "x.jpg");
    expect(res.status).toBe(401);
  });

  it("uploads a valid JPEG and returns the full, backward-compatible Media DTO", async () => {
    const source = await makeImage(800, 600, "jpeg");
    const res = await upload(source, "image/jpeg", "hero.jpg");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    expect(b.id).toBeTruthy();
    expect(b.filename).toMatch(/\.jpg$/);
    expect(b.originalName).toBe("hero.jpg");
    expect(b.mimeType).toBe("image/jpeg");
    expect(b.size).toBe(source.length);
    expect(String(b.url).startsWith(env.MEDIA_PUBLIC_URL)).toBe(true);
    expect(String(b.url)).toBe(`${env.MEDIA_PUBLIC_URL}/${storageKeyOf(b)}`);
    expect(storageKeyOf(b)).toMatch(/\.jpg$/);
    expect(b.alt).toBeNull();
    expect(b.createdBy).toBe(auth.user.id);
    expect(new Date(b.createdAt).getTime()).not.toBeNaN();
    expect(b.updatedAt).toBeTruthy();
    expect(b.width).toBe(800);
    expect(b.height).toBe(600);
    // No upscaling: an 800px source yields 320/640 only (webp + jpeg each).
    const widths = variantWidths(b);
    expect(widths).toContain(320);
    expect(widths).toContain(640);
    expect(widths).not.toContain(1024);
    expect(widths).not.toContain(1600);
    expect(b.variants.some((v: { mimeType: string }) => v.mimeType === "image/webp")).toBe(true);
    expect(b.variants.some((v: { mimeType: string }) => v.mimeType === "image/jpeg")).toBe(true);
  });

  it("uploads a valid PNG with width/height and original-format fallback variants", async () => {
    const source = await makeImage(1200, 900, "png");
    const res = await upload(source, "image/png", "photo.png");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    expect(b.mimeType).toBe("image/png");
    expect(b.filename).toMatch(/\.png$/);
    expect(b.width).toBe(1200);
    expect(b.height).toBe(900);
    expect(b.variants.some((v: { mimeType: string }) => v.mimeType === "image/webp")).toBe(true);
    expect(b.variants.some((v: { mimeType: string }) => v.mimeType === "image/png")).toBe(true);
  });

  it("uploads a valid WebP and only emits WebP derivatives", async () => {
    const source = await makeImage(500, 400, "webp");
    const res = await upload(source, "image/webp", "img.webp");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    expect(b.mimeType).toBe("image/webp");
    expect(b.filename).toMatch(/\.webp$/);
    expect(b.variants.length).toBeGreaterThan(0);
    expect(b.variants.every((v: { mimeType: string }) => v.mimeType === "image/webp")).toBe(true);
  });

  it("generates every configured width for a large source", async () => {
    const source = await makeImage(2000, 1200, "jpeg");
    const res = await upload(source, "image/jpeg", "wide.jpg");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    const widths = variantWidths(b);
    for (const w of [320, 640, 1024, 1600]) expect(widths).toContain(w);
  });

  it("preserves the original image bytes, dimensions and format on disk", async () => {
    const source = await makeImage(900, 700, "jpeg");
    const res = await upload(source, "image/jpeg", "preserve.jpg");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    const originalPath = resolve(uploadRoot, storageKeyOf(b));
    expect(await fileExists(originalPath)).toBe(true);
    const originalBytes = await fs.readFile(originalPath);
    expect(Buffer.compare(originalBytes, source)).toBe(0); // byte-for-byte preserved
    const meta = await sharp(originalBytes).metadata();
    expect(meta.width).toBe(900);
    expect(meta.height).toBe(700);
    expect(meta.format).toBe("jpeg");
  });

  it("serves a variant whose actual decoded width matches the reported width", async () => {
    const source = await makeImage(2000, 1200, "jpeg");
    const res = await upload(source, "image/jpeg", "actual.jpg");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    const webp320 = b.variants.find(
      (v: { width: number; mimeType: string }) => v.width === 320 && v.mimeType === "image/webp",
    );
    expect(webp320).toBeTruthy();
    const got = await request(app).get(`/media-files/${webp320.storageKey}`);
    expect(got.status).toBe(200);
    const meta = await sharp(got.body).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(Math.round(1200 * (320 / 2000))); // 192
  });

  it("rejects an unsupported MIME type", async () => {
    const res = await upload(Buffer.from("plain text"), "text/plain", "notes.txt");
    expect(res.status).toBe(400);
  });

  it("rejects SVG uploads", async () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle r='1'/></svg>");
    const res = await upload(svg, "image/svg+xml", "icon.svg");
    expect(res.status).toBe(400);
  });

  it("rejects an executable / non-image payload", async () => {
    const res = await upload(
      Buffer.from("MZ\x90\x00\x03 this is an exe"),
      "application/x-msdownload",
      "tool.exe",
    );
    expect(res.status).toBe(400);
  });

  it("rejects a JPEG-declared upload whose bytes are actually PNG (magic-byte mismatch)", async () => {
    const pngBytes = await makeImage(40, 40, "png");
    const res = await upload(pngBytes, "image/jpeg", "mismatch.jpg");
    expect(res.status).toBe(400);
  });

  it("rejects a PNG-declared upload with invalid magic bytes", async () => {
    const res = await upload(Buffer.from("this is not a png file at all"), "image/png", "fake.png");
    expect(res.status).toBe(400);
  });

  it("rejects a WebP-declared upload with invalid magic bytes", async () => {
    const res = await upload(Buffer.from("definitely-not-a-webp"), "image/webp", "fake.webp");
    expect(res.status).toBe(400);
  });

  it("enforces the configured upload size limit (413)", async () => {
    const seed = await makeImage(40, 40, "png");
    const oversized = Buffer.concat([seed, Buffer.alloc(env.MEDIA_MAX_FILE_SIZE_BYTES + 2048)]);
    const res = await upload(oversized, "image/png", "big.png");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects a small-byte file whose claimed dimensions exceed the pixel limit (decompression bomb)", async () => {
    const bomb = bombPng(50000, 50000); // 2.5 billion decoded pixels, tiny byte-count
    expect(bomb.length).toBeLessThan(1024);
    const res = await upload(bomb, "image/png", "bomb.png");
    expect(res.status).toBe(400);
  });

  it("strips EXIF metadata from derivatives while preserving the original", async () => {
    const source = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg({ quality: 90 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const srcMeta = await sharp(source).metadata();
    expect(srcMeta.exif).toBeTruthy(); // source genuinely carries EXIF
    const res = await upload(source, "image/jpeg", "exif.jpg");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    const originalBytes = await fs.readFile(resolve(uploadRoot, storageKeyOf(b)));
    expect(Buffer.compare(originalBytes, source)).toBe(0); // original preserved byte-for-byte
    const fallback = b.variants.find((v: { mimeType: string }) => v.mimeType === "image/jpeg");
    expect(fallback).toBeTruthy();
    const got = await request(app).get(`/media-files/${fallback.storageKey}`);
    expect(got.status).toBe(200);
    const fbMeta = await sharp(got.body).metadata();
    expect(fbMeta.exif).toBeUndefined(); // derivative EXIF stripped
  });
});

describe("Phase 9B media deletion", () => {
  it("deletes the original, every variant and the database record", async () => {
    const source = await makeImage(1400, 900, "png");
    const res = await upload(source, "image/png", "delete.png");
    expect(res.status).toBe(201);
    const b = res.body.data;
    const keys = [storageKeyOf(b), ...b.variants.map((v: { storageKey: string }) => v.storageKey)];
    for (const k of keys) expect(await fileExists(resolve(uploadRoot, k))).toBe(true);
    expect(await MediaModel.findById(b.id)).toBeTruthy();

    const del = await request(app).delete(`/api/v1/media/${b.id}`).set(auth.header);
    expect(del.status).toBe(200);
    expect(del.body.data.id).toBe(b.id);

    for (const k of keys) expect(await fileExists(resolve(uploadRoot, k))).toBe(false);
    expect(await MediaModel.findById(b.id)).toBeNull();
  });

  it("blocks deleting media referenced by a banner (409)", async () => {
    const source = await makeImage(300, 200, "jpeg");
    const res = await upload(source, "image/jpeg", "banner-img.jpg");
    expect(res.status).toBe(201);
    const b = res.body.data;
    registerCreated(res);
    await BannerModel.create({
      title: "Hero",
      image: b.id,
      linkUrl: null,
      status: "Active",
      sortOrder: 0,
      createdBy: auth.user._id,
    });
    const del = await request(app).delete(`/api/v1/media/${b.id}`).set(auth.header);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("CONFLICT");
    expect(await MediaModel.findById(b.id)).toBeTruthy();
  });
});

describe("Phase 9B static /media-files security", () => {
  it("serves uploaded media with nosniff and the correct Content-Type", async () => {
    const source = await makeImage(100, 80, "png");
    const res = await upload(source, "image/png", "serve.png");
    expect(res.status).toBe(201);
    registerCreated(res);
    const storageKey = storageKeyOf(res.body.data);
    const got = await request(app).get(`/media-files/${storageKey}`);
    expect(got.status).toBe(200);
    expect(got.headers["x-content-type-options"]).toBe("nosniff");
    expect(String(got.headers["content-type"]).startsWith("image/png")).toBe(true);
    expect(got.body.length).toBeGreaterThan(0);
  });

  it("denies dotfile access on /media-files", async () => {
    // A real dotfile inside the media root must never be served. The static
    // middleware denies it (403) or falls through to 404 — in no case 200.
    await fs.writeFile(resolve(uploadRoot, ".secret-dot"), "boom");
    const res = await request(app).get("/media-files/.secret-dot");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
    expect(res.text).not.toContain("boom");
  });

  it("denies path traversal on /media-files", async () => {
    const res = await request(app).get("/media-files/%2e%2e%2fpackage.json");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Phase 9C media HTTP caching", () => {
  it("serves media with a long-lived immutable Cache-Control plus validation headers", async () => {
    const source = await makeImage(640, 480, "webp");
    const res = await upload(source, "image/webp", "cache.webp");
    expect(res.status).toBe(201);
    registerCreated(res);
    const storageKey = storageKeyOf(res.body.data);

    const got = await request(app).get(`/media-files/${storageKey}`);
    expect(got.status).toBe(200);
    const cc = String(got.headers["cache-control"]);
    expect(cc).toContain("max-age=31536000");
    expect(cc).toContain("immutable");
    expect(got.headers["etag"]).toBeTruthy();
    expect(got.headers["last-modified"]).toBeTruthy();
    expect(String(got.headers["content-type"]).startsWith("image/webp")).toBe(true);
    expect(got.headers["x-content-type-options"]).toBe("nosniff");
    expect(got.body.length).toBeGreaterThan(0);
  });

  it("returns 304 for a matching If-None-Match (ETag) request without a body", async () => {
    const source = await makeImage(320, 240, "png");
    const res = await upload(source, "image/png", "etag.png");
    expect(res.status).toBe(201);
    registerCreated(res);
    const storageKey = storageKeyOf(res.body.data);

    const first = await request(app).get(`/media-files/${storageKey}`);
    expect(first.status).toBe(200);
    const etag = first.headers["etag"] as string;
    expect(etag).toBeTruthy();

    const second = await request(app).get(`/media-files/${storageKey}`).set("If-None-Match", etag);
    expect(second.status).toBe(304);
    // 304 has no body and keeps the ETag for revalidation.
    expect(second.headers["content-length"]).toBeUndefined();
    expect(second.headers["etag"]).toBe(etag);
  });

  it("returns 304 for a matching If-Modified-Since request without a body", async () => {
    const source = await makeImage(320, 240, "jpeg");
    const res = await upload(source, "image/jpeg", "ims.jpg");
    expect(res.status).toBe(201);
    registerCreated(res);
    const storageKey = storageKeyOf(res.body.data);

    const first = await request(app).get(`/media-files/${storageKey}`);
    expect(first.status).toBe(200);
    const lastModified = first.headers["last-modified"] as string;
    expect(lastModified).toBeTruthy();

    const second = await request(app)
      .get(`/media-files/${storageKey}`)
      .set("If-Modified-Since", lastModified);
    expect(second.status).toBe(304);
    // 304 has no entity body.
    expect(second.headers["content-length"]).toBeUndefined();
  });
});
