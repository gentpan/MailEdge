import type { AiConfig, TelegramConfig } from "../ai/types";
import { AI_DEFAULTS, TELEGRAM_DEFAULTS } from "../ai/types";
import type { Env } from "../env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { maskSecret } from "./providers";

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
    autoClassify: config.autoClassify,
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
