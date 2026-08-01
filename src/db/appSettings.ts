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

// ---------------------------------------------------------------------------
// 界面内一键更新的配置：更新 Token（加密）+ 目标账户 ID
// ---------------------------------------------------------------------------

export interface UpdateConfig {
  tokenEncrypted: string | null;
  accountId: string | null;
}

const UPDATE_KEY = "update_config";

export async function getUpdateConfig(env: Env): Promise<UpdateConfig> {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(UPDATE_KEY)
    .first<{ value: string }>();
  if (!row) return { tokenEncrypted: null, accountId: null };
  try {
    const parsed = JSON.parse(row.value) as Partial<UpdateConfig>;
    return {
      tokenEncrypted: typeof parsed.tokenEncrypted === "string" ? parsed.tokenEncrypted : null,
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : null,
    };
  } catch {
    return { tokenEncrypted: null, accountId: null };
  }
}

/** 保存更新配置。token 传 undefined 表示保持原样，传空字符串表示清除。 */
export async function saveUpdateConfig(
  env: Env,
  patch: { token?: string; accountId?: string },
): Promise<UpdateConfig> {
  const existing = await getUpdateConfig(env);

  let tokenEncrypted = existing.tokenEncrypted;
  if (patch.token !== undefined) {
    tokenEncrypted = patch.token ? await encryptJson(env.ENCRYPTION_KEY, patch.token) : null;
  }
  const accountId = patch.accountId !== undefined ? patch.accountId || null : existing.accountId;

  const next = { tokenEncrypted, accountId };
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3`,
  )
    .bind(UPDATE_KEY, JSON.stringify(next), new Date().toISOString())
    .run();
  return next;
}

/** 解密更新 Token（仅服务端用于发起更新，绝不回传） */
export async function decryptUpdateToken(env: Env, tokenEncrypted: string): Promise<string> {
  return decryptJson<string>(env.ENCRYPTION_KEY, tokenEncrypted);
}
