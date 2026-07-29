import type { Env } from "../env";
import { decryptJson, encryptJson } from "../lib/crypto";
import { newId } from "../lib/id";
import type { MailProviderConfig, MailProviderRecord, MailProviderType } from "../mail/types";

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  config_encrypted: string;
  is_default: number;
  is_enabled: number;
  priority: number;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
}

async function toRecord(env: Env, row: ProviderRow): Promise<MailProviderRecord> {
  const config = await decryptJson<MailProviderConfig>(env.ENCRYPTION_KEY, row.config_encrypted);
  return {
    id: row.id,
    name: row.name,
    type: row.type as MailProviderType,
    config,
    isDefault: row.is_default === 1,
    isEnabled: row.is_enabled === 1,
    priority: row.priority,
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at,
    createdAt: row.created_at,
  };
}

export async function listProviders(env: Env): Promise<MailProviderRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM mail_providers ORDER BY is_default DESC, priority ASC, created_at ASC`,
  ).all<ProviderRow>();
  return Promise.all(results.map((row) => toRecord(env, row)));
}

export async function getProvider(env: Env, id: string): Promise<MailProviderRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM mail_providers WHERE id = ?`).bind(id).first<ProviderRow>();
  return row ? toRecord(env, row) : null;
}

/**
 * 发送顺序：默认渠道优先，其余按 priority 作为备用。
 * 只返回启用中的渠道。
 */
export async function getSendChain(env: Env, preferredId?: string): Promise<MailProviderRecord[]> {
  const all = (await listProviders(env)).filter((item) => item.isEnabled);
  if (!preferredId) return all;

  const preferred = all.find((item) => item.id === preferredId);
  if (!preferred) return all;
  return [preferred, ...all.filter((item) => item.id !== preferredId)];
}

export interface UpsertProviderInput {
  id?: string;
  name: string;
  type: MailProviderType;
  config: MailProviderConfig;
  isEnabled?: boolean;
  isDefault?: boolean;
  priority?: number;
}

export async function upsertProvider(env: Env, input: UpsertProviderInput): Promise<MailProviderRecord> {
  const encrypted = await encryptJson(env.ENCRYPTION_KEY, input.config);
  const id = input.id ?? newId("prov");
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO mail_providers (id, name, type, config_encrypted, is_default, is_enabled, priority, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(id) DO UPDATE SET
       name = ?2,
       type = ?3,
       config_encrypted = ?4,
       is_enabled = ?6,
       priority = ?7,
       updated_at = ?8`,
  )
    .bind(
      id,
      input.name,
      input.type,
      encrypted,
      input.isDefault ? 1 : 0,
      input.isEnabled === false ? 0 : 1,
      input.priority ?? 100,
      now,
    )
    .run();

  if (input.isDefault) await setDefaultProvider(env, id);

  const record = await getProvider(env, id);
  if (!record) throw new Error("保存后未能读取渠道记录");
  return record;
}

export async function setDefaultProvider(env: Env, id: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`UPDATE mail_providers SET is_default = 0 WHERE id != ?`).bind(id),
    env.DB.prepare(`UPDATE mail_providers SET is_default = 1, is_enabled = 1 WHERE id = ?`).bind(id),
  ]);
}

export async function deleteProvider(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM mail_providers WHERE id = ?`).bind(id).run();
}

export async function recordProviderHealth(env: Env, id: string, error: string | null): Promise<void> {
  await env.DB.prepare(`UPDATE mail_providers SET last_error = ?, last_checked_at = ? WHERE id = ?`)
    .bind(error, new Date().toISOString(), id)
    .run();
}

/** 脱敏后的渠道视图，用于返回给前端 */
export function redactProvider(record: MailProviderRecord) {
  const config = record.config;
  const redacted: Record<string, unknown> = { type: config.type };

  if (config.type === "cloudflare") {
    redacted.defaultDomain = config.defaultDomain ?? null;
  } else if (config.type === "resend") {
    redacted.apiKey = maskSecret(config.apiKey);
    redacted.verifiedDomains = config.verifiedDomains ?? [];
  } else {
    redacted.token = maskSecret(config.token);
    redacted.secret = config.secret ? maskSecret(config.secret) : null;
    redacted.baseUrl = config.baseUrl ?? null;
    redacted.verifiedDomains = config.verifiedDomains ?? [];
  }

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    isDefault: record.isDefault,
    isEnabled: record.isEnabled,
    priority: record.priority,
    lastError: record.lastError ?? null,
    lastCheckedAt: record.lastCheckedAt ?? null,
    createdAt: record.createdAt,
    config: redacted,
  };
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
