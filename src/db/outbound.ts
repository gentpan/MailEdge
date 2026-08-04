import type { Env } from "../env";
import { r2Key, safeName } from "../lib/r2key";
import type { MailAddress, OutboundStatus, SendAttempt, SendMailInput } from "../mail/types";
import { createObjectStorage } from "../storage";
import { getOutboundRetentionDays } from "./appSettings";

export interface OutboundRecord {
  id: string;
  userId: string | null;
  mailboxId: string | null;
  fromEmail: string;
  to: MailAddress[];
  subject: string;
  status: OutboundStatus;
  providerId: string | null;
  providerType: string | null;
  providerMessageId: string | null;
  attempts: number;
  attemptLog: SendAttempt[];
  lastError: string | null;
  payloadKey: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OutboundRow {
  id: string;
  user_id: string | null;
  mailbox_id: string | null;
  from_email: string;
  to_json: string;
  subject: string;
  status: string;
  provider_id: string | null;
  provider_type: string | null;
  provider_message_id: string | null;
  attempts: number;
  attempt_log: string;
  last_error: string | null;
  payload_key: string | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toRecord(row: OutboundRow): OutboundRecord {
  return {
    id: row.id,
    userId: row.user_id,
    mailboxId: row.mailbox_id,
    fromEmail: row.from_email,
    to: parseJson<MailAddress[]>(row.to_json, []),
    subject: row.subject,
    status: row.status as OutboundStatus,
    providerId: row.provider_id,
    providerType: row.provider_type,
    providerMessageId: row.provider_message_id,
    attempts: row.attempts,
    attemptLog: parseJson<SendAttempt[]>(row.attempt_log, []),
    lastError: row.last_error,
    payloadKey: row.payload_key,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createOutbound(
  env: Env,
  params: {
    id: string;
    userId: string | null;
    mailboxId: string | null;
    input: SendMailInput;
    payloadKey: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO outbound_messages (id, user_id, mailbox_id, from_email, to_json, subject, status, payload_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'queued', ?7, ?8, ?8)`,
  )
    .bind(
      params.id,
      params.userId,
      params.mailboxId,
      params.input.from.email,
      JSON.stringify(params.input.to),
      params.input.subject,
      params.payloadKey,
      now,
    )
    .run();
}

export async function updateOutbound(
  env: Env,
  id: string,
  patch: {
    status?: OutboundStatus;
    providerId?: string | null;
    providerType?: string | null;
    providerMessageId?: string | null;
    lastError?: string | null;
    nextRetryAt?: string | null;
    attemptLog?: SendAttempt[];
    incrementAttempts?: boolean;
  },
): Promise<void> {
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [new Date().toISOString()];

  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };

  if (patch.status !== undefined) push("status", patch.status);
  if (patch.providerId !== undefined) push("provider_id", patch.providerId);
  if (patch.providerType !== undefined) push("provider_type", patch.providerType);
  if (patch.providerMessageId !== undefined) push("provider_message_id", patch.providerMessageId);
  if (patch.lastError !== undefined) push("last_error", patch.lastError);
  if (patch.nextRetryAt !== undefined) push("next_retry_at", patch.nextRetryAt);
  if (patch.attemptLog !== undefined) push("attempt_log", JSON.stringify(patch.attemptLog));
  if (patch.incrementAttempts) sets.push("attempts = attempts + 1");

  values.push(id);
  await env.DB.prepare(`UPDATE outbound_messages SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function getOutbound(env: Env, id: string): Promise<OutboundRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM outbound_messages WHERE id = ?`)
    .bind(id)
    .first<OutboundRow>();
  return row ? toRecord(row) : null;
}

export async function listOutbound(env: Env, userId: string, limit = 50): Promise<OutboundRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM outbound_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(userId, limit)
    .all<OutboundRow>();
  return results.map(toRecord);
}

/** cron 用：到点需要重试的 deferred 邮件 */
export async function listRetryable(env: Env, limit = 20): Promise<OutboundRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM outbound_messages
     WHERE status = 'deferred' AND next_retry_at IS NOT NULL AND next_retry_at <= ?
     ORDER BY next_retry_at ASC LIMIT ?`,
  )
    .bind(new Date().toISOString(), limit)
    .all<OutboundRow>();
  return results.map(toRecord);
}

/**
 * 定时清理过期的发信状态记录。
 * 先删除记录引用的重试载荷，再删除 D1 行；对象清理失败时保留记录，避免产生无法重试的孤儿状态。
 */
export async function cleanupExpiredOutbound(env: Env, batchSize = 100): Promise<number> {
  const retentionDays = await getOutboundRetentionDays(env);
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  let deleted = 0;

  for (;;) {
    const { results } = await env.DB.prepare(
      `SELECT id, payload_key FROM outbound_messages
       WHERE created_at < ? ORDER BY created_at ASC LIMIT ?`,
    )
      .bind(cutoff, Math.min(Math.max(batchSize, 1), 200))
      .all<Pick<OutboundRow, "id" | "payload_key">>();
    if (!results.length) break;

    const payloadKeys = results.map((row) => row.payload_key).filter((key): key is string => Boolean(key));
    if (payloadKeys.length) {
      await (await createObjectStorage(env)).delete(payloadKeys);
    }

    const placeholders = results.map(() => "?").join(", ");
    const removed = await env.DB.prepare(`DELETE FROM outbound_messages WHERE id IN (${placeholders})`)
      .bind(...results.map((row) => row.id))
      .run();
    deleted += removed.meta.changes ?? results.length;
    if (results.length < batchSize) break;
  }

  return deleted;
}

// ---------------------------------------------------------------------------
// 发送载荷（含附件）落对象存储，重试时无需前端再传一次
// ---------------------------------------------------------------------------

interface StoredAttachment {
  filename: string;
  contentType: string;
  contentId?: string;
  r2Key: string;
}

interface StoredPayload extends Omit<SendMailInput, "attachments"> {
  attachments?: StoredAttachment[];
}

export interface SavedPayload {
  key: string;
  /** 与 input.attachments 顺序一一对应的对象存储键，供「已发送」留底引用 */
  attachments: Array<{ filename: string; contentType: string; r2Key: string }>;
}

export async function savePayload(
  env: Env,
  id: string,
  input: SendMailInput,
  mailboxId: string,
): Promise<SavedPayload> {
  const objectStorage = await createObjectStorage(env);
  const dir = r2Key.outboundDir(mailboxId, id);
  const attachments: StoredAttachment[] = [];

  for (const [index, attachment] of (input.attachments ?? []).entries()) {
    const key = `${dir}/attachments/${index}-${safeName(attachment.filename, 80)}`;
    await objectStorage.put(key, attachment.content, {
      httpMetadata: { contentType: attachment.contentType },
    });
    attachments.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      contentId: attachment.contentId,
      r2Key: key,
    });
  }

  const payload: StoredPayload = { ...input, attachments: attachments.length ? attachments : undefined };
  const key = `${dir}/payload.json`;
  await objectStorage.put(key, JSON.stringify(payload), {
    httpMetadata: { contentType: "application/json" },
  });
  return { key, attachments };
}

export async function loadPayload(env: Env, key: string): Promise<SendMailInput | null> {
  const objectStorage = await createObjectStorage(env);
  const object = await objectStorage.get(key);
  if (!object) return null;

  const payload = (await object.json()) as StoredPayload;
  const attachments = [];

  for (const item of payload.attachments ?? []) {
    const file = await objectStorage.get(item.r2Key);
    if (!file) continue;
    attachments.push({
      filename: item.filename,
      contentType: item.contentType,
      contentId: item.contentId,
      content: await file.arrayBuffer(),
    });
  }

  return { ...payload, attachments: attachments.length ? attachments : undefined };
}

/**
 * 邮件终态后清理对象存储中的发送载荷（payload.json）。
 * 只删元数据文件，保留 attachments/ 下的附件二进制——「已发送」留底
 * 引用的正是这些键，删了前端就永远 404；附件随 outbound 前缀由
 * 对象存储生命周期规则统一清理。
 */
export async function deletePayload(env: Env, payloadKey: string | null): Promise<void> {
  if (!payloadKey) return;
  await (await createObjectStorage(env)).delete(payloadKey);
}
