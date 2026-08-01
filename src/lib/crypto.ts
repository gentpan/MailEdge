/**
 * Provider 配置的对称加密（AES-GCM）与口令哈希（PBKDF2-SHA256）。
 * 主密钥来自 env.ENCRYPTION_KEY，只存在于 Worker 机密中，不落库。
 */

const IV_LENGTH = 12;
// Cloudflare Workers 生产环境对 PBKDF2 迭代次数有 100,000 上限，
// 超过会抛 "iteration counts above 100000 are not supported"。
// 本地 workerd 测试没有此限制，所以高于上限在测试里能过、上生产必炸。
const PBKDF2_ITERATIONS = 100_000;

function importedKeyCache(): Map<string, Promise<CryptoKey>> {
  // 同一 isolate 内复用，避免每次请求都做一次 importKey
  const globalScope = globalThis as unknown as { __mailedgeKeyCache?: Map<string, Promise<CryptoKey>> };
  globalScope.__mailedgeKeyCache ??= new Map();
  return globalScope.__mailedgeKeyCache;
}

function getAesKey(masterKey: string): Promise<CryptoKey> {
  const cache = importedKeyCache();
  const cached = cache.get(masterKey);
  if (cached) return cached;

  const promise = (async () => {
    const raw = base64ToBytes(masterKey);
    if (raw.byteLength !== 32) {
      throw new Error("ENCRYPTION_KEY 必须是 32 字节的 base64（openssl rand -base64 32）");
    }
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();

  cache.set(masterKey, promise);
  return promise;
}

export async function encryptJson(masterKey: string, value: unknown): Promise<string> {
  const key = await getAesKey(masterKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  const packed = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), IV_LENGTH);
  return bytesToBase64(packed);
}

export async function decryptJson<T>(masterKey: string, payload: string): Promise<T> {
  const key = await getAesKey(masterKey);
  const packed = base64ToBytes(payload);
  if (packed.byteLength <= IV_LENGTH) throw new Error("密文格式不正确");

  const iv = packed.slice(0, IV_LENGTH);
  const ciphertext = packed.slice(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export async function hashPassword(password: string, saltBase64?: string) {
  const salt = saltBase64 ? base64ToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    256,
  );
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const derived = await hashPassword(password, salt);
  return timingSafeEqual(derived.hash, hash);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}
