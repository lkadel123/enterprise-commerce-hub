import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";

// ── Shared interface ──

export interface MediaStorage {
  store(storageKey: string, content: Buffer): Promise<string>;
  remove(storageKey: string): Promise<void>;
  /** Returns the public URL for a storage key without I/O. */
  getPublicUrl(storageKey: string): string;
}

/** Reject any storage key that could escape the storage root. */
function validateStorageKey(storageKey: string): void {
  if (storageKey.includes("..") || storageKey.includes("\\") || storageKey.startsWith("/")) {
    throw new Error(`Invalid media storage key: ${storageKey}`);
  }
}

function joinPublicUrl(baseUrl: string, storageKey: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(storageKey, base).toString();
}

/**
 * Long-lived immutable cache directive for origin objects. Media URLs are
 * effectively immutable (UUID keys, wx/no-clobber writes, new-UUID-per-replace),
 * so a fronting CDN / browser may cache originals + variants for the full TTL.
 */
const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Maps a storage key's server-generated extension to the correct Content-Type. */
function contentTypeForStorageKey(storageKey: string): string {
  if (/\.jpe?g$/i.test(storageKey)) return "image/jpeg";
  if (/\.png$/i.test(storageKey)) return "image/png";
  if (/\.webp$/i.test(storageKey)) return "image/webp";
  return "application/octet-stream";
}

// ── Local filesystem storage ──

/** Absolute path to the local uploads root (used by express.static). */
export const localMediaStorageRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

function localPath(root: string, storageKey: string): string {
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Media storage key escapes the uploads root: ${storageKey}`);
  }
  return target;
}

export class LocalMediaStorage implements MediaStorage {
  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  async store(storageKey: string, content: Buffer): Promise<string> {
    validateStorageKey(storageKey);
    const target = localPath(this.root, storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { flag: "wx", mode: 0o600 });
    return this.getPublicUrl(storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    validateStorageKey(storageKey);
    const target = localPath(this.root, storageKey);
    await rm(target, { force: true });
  }

  getPublicUrl(storageKey: string): string {
    return joinPublicUrl(this.baseUrl, storageKey);
  }
}

// ── S3-compatible object storage ──

export interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  mediaPublicUrl: string;
}

export interface S3Adapter {
  putObject(args: {
    Key: string;
    Body: Buffer;
    ContentType?: string;
    CacheControl?: string;
  }): Promise<void>;
  deleteObject(args: { Key: string }): Promise<void>;
}

export class S3MediaStorage implements MediaStorage {
  constructor(
    private readonly config: S3Config,
    private readonly adapter: S3Adapter,
  ) {}

  async store(storageKey: string, content: Buffer): Promise<string> {
    validateStorageKey(storageKey);
    // Carry the correct Content-Type and a long-lived immutable Cache-Control so
    // a fronting CDN / edge cache serves media with the right metadata.
    await this.adapter.putObject({
      Key: storageKey,
      Body: content,
      ContentType: contentTypeForStorageKey(storageKey),
      CacheControl: MEDIA_CACHE_CONTROL,
    });
    return this.getPublicUrl(storageKey);
  }

  async remove(storageKey: string): Promise<void> {
    validateStorageKey(storageKey);
    await this.adapter.deleteObject({ Key: storageKey });
  }

  getPublicUrl(storageKey: string): string {
    return joinPublicUrl(this.config.mediaPublicUrl, storageKey);
  }
}

// ── Provider factory ──

export function createMediaStorage(provider: string): MediaStorage {
  if (provider === "local") {
    return new LocalMediaStorage(localMediaStorageRoot, env.MEDIA_PUBLIC_URL);
  }

  if (provider === "s3") {
    const config: S3Config = {
      bucket: env.S3_BUCKET,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      mediaPublicUrl: env.MEDIA_PUBLIC_URL,
    };

    // Constructing the client does NOT perform network I/O; all requests are
    // deferred until putObject/deleteObject are invoked.
    const client = new S3Client({
      endpoint: config.endpoint || undefined,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });

    const adapter: S3Adapter = {
      putObject: async (args) => {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: args.Key,
            Body: args.Body,
            ContentType: args.ContentType,
            CacheControl: args.CacheControl,
          }),
        );
      },
      deleteObject: async (args) => {
        await client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: args.Key,
          }),
        );
      },
    };

    return new S3MediaStorage(config, adapter);
  }

  throw new Error(`Unknown storage provider: ${provider}`);
}

export const mediaStorage: MediaStorage = createMediaStorage(env.STORAGE_PROVIDER);
