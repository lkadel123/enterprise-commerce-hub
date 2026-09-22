import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  LocalMediaStorage,
  S3MediaStorage,
  createMediaStorage,
  type S3Adapter,
  type S3Config,
} from "../src/storage/mediaStorage.js";

const root = mkdtempSync(join(tmpdir(), "ech-media-storage-"));
const baseUrl = "http://test.localhost/media-files";
const storage = new LocalMediaStorage(root, baseUrl);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("LocalMediaStorage (Phase 9B)", () => {
  it("stores a file under the configured root and returns the public URL", async () => {
    const key = "2026-08/a.jpg";
    const url = await storage.store(key, Buffer.from("payload"));
    expect(url).toBe(`${baseUrl}/${key}`);
    expect(existsSync(resolve(root, key))).toBe(true);
    expect(readFileSync(resolve(root, key)).toString()).toBe("payload");
    expect(await storage.getPublicUrl(key)).toBe(`${baseUrl}/${key}`);
  });

  it("recursively creates the storage key's parent directories", async () => {
    const key = "nested/deep/b.jpg";
    await storage.store(key, Buffer.from("nested"));
    expect(existsSync(resolve(root, key))).toBe(true);
  });

  it("remove deletes the stored file and tolerates a missing key", async () => {
    const key = "del/c.jpg";
    await storage.store(key, Buffer.from("gone"));
    expect(existsSync(resolve(root, key))).toBe(true);
    await storage.remove(key);
    expect(existsSync(resolve(root, key))).toBe(false);
    await expect(storage.remove("del/never-existed.jpg")).resolves.toBeUndefined();
  });

  it("refuses to overwrite an existing storage key (wx, no clobber)", async () => {
    const key = "clobber/d.jpg";
    await storage.store(key, Buffer.from("first"));
    await expect(storage.store(key, Buffer.from("second"))).rejects.toThrow();
    expect(readFileSync(resolve(root, key)).toString()).toBe("first");
  });

  it("rejects path-traversal storage keys", async () => {
    const bad = [
      "../outside",
      "../../outside",
      "/etc/passwd",
      "a/../../b",
      "..\\win",
      "C:\\windows\\system32\\x",
    ];
    for (const key of bad) {
      await expect(storage.store(key, Buffer.from("x"))).rejects.toThrow();
      await expect(storage.remove(key)).rejects.toThrow();
    }
  });
});

describe("createMediaStorage provider factory (Phase 9B)", () => {
  it("returns LocalMediaStorage for the local provider", () => {
    expect(createMediaStorage("local")).toBeInstanceOf(LocalMediaStorage);
  });

  it("returns S3MediaStorage for the s3 provider without network I/O", () => {
    // Constructing the S3 implementation must not require credentials to exist
    // or make any network call; it is only instantiated here.
    expect(createMediaStorage("s3")).toBeInstanceOf(S3MediaStorage);
  });
});

describe("S3MediaStorage via injected transport (Phase 9B)", () => {
  function config(): S3Config {
    return {
      bucket: "test-bucket",
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      accessKeyId: "ak",
      secretAccessKey: "sk",
      forcePathStyle: true,
      mediaPublicUrl: "https://cdn.example.com/media-files",
    };
  }

  it("writes and deletes objects through the real adapter code with the CDN public URL", async () => {
    const puts: string[] = [];
    const dels: string[] = [];
    const transport: S3Adapter = {
      putObject: async (args) => {
        puts.push(args.Key);
      },
      deleteObject: async (args) => {
        dels.push(args.Key);
      },
    };
    const s3 = new S3MediaStorage(config(), transport);

    const url = await s3.store("2026-08/variant.jpg", Buffer.from("img"));
    expect(url).toBe("https://cdn.example.com/media-files/2026-08/variant.jpg");
    expect(puts).toEqual(["2026-08/variant.jpg"]);
    expect(await s3.getPublicUrl("2026-08/variant.jpg")).toBe(
      "https://cdn.example.com/media-files/2026-08/variant.jpg",
    );

    await s3.remove("2026-08/variant.jpg");
    expect(dels).toEqual(["2026-08/variant.jpg"]);
  });

  it("rejects unsafe storage keys before touching the transport", async () => {
    const puts: string[] = [];
    const transport: S3Adapter = {
      putObject: async (args) => {
        puts.push(args.Key);
      },
      deleteObject: async () => undefined,
    };
    const s3 = new S3MediaStorage(config(), transport);
    for (const key of ["../escape", "a/../../b", "..\\win", "C:\\x\\y"]) {
      await expect(s3.store(key, Buffer.from("x"))).rejects.toThrow();
    }
    expect(puts).toEqual([]);
  });

  it("propagates Cache-Control and Content-Type metadata for CDN-ready objects", async () => {
    const captured: Array<{ Key: string; ContentType?: string; CacheControl?: string }> = [];
    const transport: S3Adapter = {
      putObject: async (args) => {
        captured.push(args);
      },
      deleteObject: async () => undefined,
    };
    const s3 = new S3MediaStorage(config(), transport);

    await s3.store("2026-08/original.jpg", Buffer.from("img"));
    await s3.store("2026-08/variant-w320.webp", Buffer.from("webp"));
    await s3.store("2026-08/variant-w320.png", Buffer.from("png"));

    expect(captured).toHaveLength(3);

    const jpg = captured[0];
    expect(jpg.Key).toBe("2026-08/original.jpg");
    expect(jpg.ContentType).toBe("image/jpeg");
    expect(jpg.CacheControl).toBe("public, max-age=31536000, immutable");

    const webp = captured[1];
    expect(webp.Key).toBe("2026-08/variant-w320.webp");
    expect(webp.ContentType).toBe("image/webp");
    expect(webp.CacheControl).toBe("public, max-age=31536000, immutable");

    const png = captured[2];
    expect(png.Key).toBe("2026-08/variant-w320.png");
    expect(png.ContentType).toBe("image/png");
    expect(png.CacheControl).toBe("public, max-age=31536000, immutable");
  });
});
