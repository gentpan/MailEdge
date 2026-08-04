import type { AiConfig, TelegramConfig } from "../ai/types";
import { AI_DEFAULTS, TELEGRAM_DEFAULTS } from "../ai/types";
import type { Env } from "../env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { maskSecret } from "./providers";

export type StorageBackend = "r2" | "kv";

const STORAGE_BACKEND_KEY = "storage_backend";
const OUTBOUND_RETENTION_KEY = "outbound_retention_days";
export const OUTBOUND_RETENTION_OPTIONS = [90, 180, 365] as const;
export type OutboundRetentionDays = (typeof OUTBOUND_RETENTION_OPTIONS)[number];

/**
 * 读取附件/载荷的默认对象存储。旧实例没有这条设置时继续使用 R2，
 * 这样升级不会改变现有数据的位置。
 */
export async function getStorageBackend(env: Env): Promise<StorageBackend> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(STORAGE_BACKEND_KEY)
    .first<{ value: string }>();
  return row?.value === "kv" ? "kv" : "r2";
}

export async function saveStorageBackend(env: Env, backend: StorageBackend): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3`,
  )
    .bind(STORAGE_BACKEND_KEY, backend, new Date().toISOString())
    .run();
}

/** 发信状态记录的保留时间；默认 365 天，避免升级后意外清理历史数据。 */
export async function getOutboundRetentionDays(env: Env): Promise<OutboundRetentionDays> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(OUTBOUND_RETENTION_KEY)
    .first<{ value: string }>();
  const days = Number(row?.value);
  return OUTBOUND_RETENTION_OPTIONS.includes(days as OutboundRetentionDays)
    ? (days as OutboundRetentionDays)
    : 365;
}

export async function saveOutboundRetentionDays(env: Env, days: number): Promise<OutboundRetentionDays> {
  if (!OUTBOUND_RETENTION_OPTIONS.includes(days as OutboundRetentionDays)) {
    throw new Error(`保留时间必须是 ${OUTBOUND_RETENTION_OPTIONS.join("、")} 天之一`);
  }
  const value = days as OutboundRetentionDays;
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3`,
  )
    .bind(OUTBOUND_RETENTION_KEY, String(value), new Date().toISOString())
    .run();
  return value;
}

/**
 * settings 表存加密后的应用级配置。AI Key、Telegram Token 都是机密，
 * 复用 Provider 那套 AES-GCM 加密，接口对外只返回脱敏值。
 */

async function readEncrypted<T>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>();
  if (!row) return fallback;
  try {
    return { ...fallback, ...(await decryptJson<Partial<T>>(env.ENCRYPTION_KEY, row.value)) };
  } catch {
    return fallback;
  }
}

async function writeEncrypted(env: Env, key: string, value: unknown): Promise<void> {
  const encrypted = await encryptJson(env.ENCRYPTION_KEY, value);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3`,
  )
    .bind(key, encrypted, new Date().toISOString())
    .run();
}

export const getAiConfig = (env: Env) => readEncrypted<AiConfig>(env, "ai_config", AI_DEFAULTS);
export const saveAiConfig = (env: Env, value: AiConfig) => writeEncrypted(env, "ai_config", value);

export const getTelegramConfig = (env: Env) =>
  readEncrypted<TelegramConfig>(env, "telegram_config", TELEGRAM_DEFAULTS);
export const saveTelegramConfig = (env: Env, value: TelegramConfig) =>
  writeEncrypted(env, "telegram_config", value);

/** 脱敏后的 AI 配置，用于返回前端 */
export function redactAi(config: AiConfig) {
  return {
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    apiKey: maskSecret(config.apiKey),
    hasKey: Boolean(config.apiKey),
    model: config.model,
  };
}

export function redactTelegram(config: TelegramConfig) {
  return {
    enabled: config.enabled,
    botToken: maskSecret(config.botToken),
    hasToken: Boolean(config.botToken),
    chatId: config.chatId,
    onlyCategories: config.onlyCategories,
  };
}
