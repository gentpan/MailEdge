import { getStorageBackend, type StorageBackend } from "./db/appSettings";
import type { Env } from "./env";

/** Cloudflare KV 的单值上限。R2 没有这个限制，但上传接口也会使用此值做保护。 */
export const MAX_KV_VALUE_BYTES = 25 * 1024 * 1024;

export interface StorageHttpMetadata {
  contentType?: string;
  contentDisposition?: string;
}

/** R2ObjectBody 与 KV 读取结果的共同最小接口。 */
export interface StorageObjectBody {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: StorageHttpMetadata;
  arrayBuffer(): Promise<ArrayBuffer>;
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
}

export interface StorageObjectSummary {
  key: string;
  size?: number;
  uploaded?: Date;
  metadata?: Record<string, unknown>;
}

export interface ObjectStorageListResult {
  objects: StorageObjectSummary[];
  truncated: boolean;
  cursor?: string;
}

export type StorageValue = string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream<Uint8Array>;

export interface StoragePutOptions {
  httpMetadata?: StorageHttpMetadata;
  /** 流式上传时由调用方提供大小，便于 KV 列表和附件管理显示正确容量。 */
  size?: number;
}

export interface ObjectStorage {
  /** 实际写入的主后端；当设置的后端未绑定时会自动回退到另一个已绑定后端。 */
  readonly backend: StorageBackend;
  put(key: string, value: StorageValue, options?: StoragePutOptions): Promise<void>;
  get(key: string): Promise<StorageObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<ObjectStorageListResult>;
}

type ByteMetadata = StorageHttpMetadata & { size?: number };

function byteLength(value: StorageValue): number | undefined {
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof Blob) return value.size;
  return undefined;
}

function assertKvSize(value: StorageValue): void {
  const size = byteLength(value);
  if (size !== undefined && size > MAX_KV_VALUE_BYTES) {
    throw new Error(`KV 单个对象不能超过 ${Math.floor(MAX_KV_VALUE_BYTES / 1024 / 1024)} MB`);
  }
}

function unavailable(backend: StorageBackend): Error {
  return new Error(
    backend === "kv"
      ? "KV 存储未配置，请在 wrangler.jsonc 绑定 KV namespace 后重新部署"
      : "R2 存储未配置，请绑定 R2 bucket 或在设置中切换到 KV",
  );
}

function asBody(value: ArrayBuffer, metadata: ByteMetadata | null): StorageObjectBody {
  const body = new Response(value).body;
  if (!body) throw new Error("无法读取存储对象");
  return {
    body,
    httpMetadata: metadata
      ? { contentType: metadata.contentType, contentDisposition: metadata.contentDisposition }
      : undefined,
    arrayBuffer: async () => value,
    text: async () => new TextDecoder().decode(value),
    json: async <T>() => JSON.parse(new TextDecoder().decode(value)) as T,
  };
}

class R2Storage implements ObjectStorage {
  readonly backend = "r2" as const;

  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, value: StorageValue, options?: StoragePutOptions) {
    await this.bucket.put(
      key,
      value,
      options?.httpMetadata ? { httpMetadata: options.httpMetadata } : undefined,
    );
  }

  async get(key: string): Promise<StorageObjectBody | null> {
    return (await this.bucket.get(key)) as StorageObjectBody | null;
  }

  async delete(keys: string | string[]): Promise<void> {
    await this.bucket.delete(keys);
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ObjectStorageListResult> {
    const result = await this.bucket.list(options);
    return {
      objects: result.objects.map((object) => ({
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
        metadata: object.customMetadata,
      })),
      truncated: result.truncated,
      cursor: result.truncated ? result.cursor : undefined,
    };
  }
}

interface KvMetadata extends ByteMetadata {}

class KvStorage implements ObjectStorage {
  readonly backend = "kv" as const;

  constructor(private readonly namespace: KVNamespace) {}

  async put(key: string, value: StorageValue, options?: StoragePutOptions) {
    assertKvSize(value);
    const storedValue = value instanceof Blob ? await value.arrayBuffer() : value;
    const metadata: KvMetadata = {
      ...(options?.httpMetadata ?? {}),
      size: options?.size ?? byteLength(value),
    };
    await this.namespace.put(key, storedValue, { metadata });
  }

  async get(key: string): Promise<StorageObjectBody | null> {
    const result = await this.namespace.getWithMetadata<KvMetadata>(key, "arrayBuffer");
    return result.value === null ? null : asBody(result.value, result.metadata);
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) await this.namespace.delete(key);
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ObjectStorageListResult> {
    const result = await this.namespace.list<KvMetadata>({
      prefix: options?.prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    });
    return {
      objects: result.keys.map((key) => ({
        key: key.name,
        size: key.metadata?.size,
        metadata: key.metadata ? { ...key.metadata } : undefined,
        uploaded: key.expiration ? new Date(key.expiration * 1000) : undefined,
      })),
      truncated: !result.list_complete,
      cursor: result.list_complete ? undefined : result.cursor,
    };
  }
}

/**
 * 创建统一对象存储。设置只决定写入主后端；读取和删除会同时检查两个已绑定后端，
 * 因此从 R2 切换到 KV（或反向切换）不会让历史附件突然消失。
 */
export async function createObjectStorage(env: Env): Promise<ObjectStorage> {
  const configured = await getStorageBackend(env);
  const r2 = env.R2 ? new R2Storage(env.R2) : null;
  const kv = env.KV ? new KvStorage(env.KV) : null;
  const primary = configured === "kv" ? kv : r2;
  const fallback = configured === "kv" ? r2 : kv;

  if (!primary && !fallback) throw unavailable(configured);
  if (!primary) return new FallbackStorage(fallback!, configured === "kv" ? "r2" : "kv", null);
  return new FallbackStorage(primary, primary.backend, fallback);
}

/** 将主后端与旧后端组合，兼容切换前已经写入的数据。 */
class FallbackStorage implements ObjectStorage {
  constructor(
    private readonly primary: ObjectStorage,
    readonly backend: StorageBackend,
    private readonly fallback: ObjectStorage | null,
  ) {}

  put(key: string, value: StorageValue, options?: StoragePutOptions) {
    return this.primary.put(key, value, options);
  }

  async get(key: string): Promise<StorageObjectBody | null> {
    return (await this.primary.get(key)) ?? (this.fallback ? this.fallback.get(key) : null);
  }

  async delete(keys: string | string[]): Promise<void> {
    const errors: unknown[] = [];
    for (const store of [this.primary, this.fallback].filter(Boolean) as ObjectStorage[]) {
      try {
        await store.delete(keys);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 2) throw errors[0];
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ObjectStorageListResult> {
    const first = await this.primary.list(options);
    if (!this.fallback) return first;
    const second = await this.fallback.list(options);
    const byKey = new Map(first.objects.map((object) => [object.key, object]));
    for (const object of second.objects) if (!byKey.has(object.key)) byKey.set(object.key, object);
    const objects = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
    const limit = options?.limit;
    return {
      objects: limit ? objects.slice(0, limit) : objects,
      truncated: first.truncated || second.truncated || (limit ? objects.length > limit : false),
      cursor: first.cursor ?? second.cursor,
    };
  }
}
