import type { Env } from "../env";
import { dirPrefix, r2Key, safeName } from "../lib/r2key";
import type { MailAddress, OutboundStatus, SendAttempt, SendMailInput } from "../mail/types";

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

function toRecord(row: OutboundRow): OutboundRecord {
  return {
    id: row.id,
    userId: row.user_id,
    mailboxId: row.mailbox_id,
    fromEmail: row.from_email,
    to: JSON.parse(row.to_json) as MailAddress[],
    subject: row.subject,
    status: row.status as OutboundStatus,
    providerId: row.provider_id,
    providerType: row.provider_type,
    providerMessageId: row.provider_message_id,
    attempts: row.attempts,
    attemptLog: JSON.parse(row.attempt_log) as SendAttempt[],
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
  const row = await env.DB.prepare(`SELECT * FROM outbound_messages WHERE id = ?`).bind(id).first<OutboundRow>();
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

// ---------------------------------------------------------------------------
// 发送载荷（含附件）落 R2，重试时无需前端再传一次
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

export async function savePayload(
  env: Env,
  id: string,
  input: SendMailInput,
  mailboxId: string,
): Promise<string> {
  const dir = r2Key.outboundDir(mailboxId, id);
  const attachments: StoredAttachment[] = [];

  for (const [index, attachment] of (input.attachments ?? []).entries()) {
    const key = `${dir}/attachments/${index}-${safeName(attachment.filename, 80)}`;
    await env.R2.put(key, attachment.content, {
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
  await env.R2.put(key, JSON.stringify(payload), { httpMetadata: { contentType: "application/json" } });
  return key;
}

export async function loadPayload(env: Env, key: string): Promise<SendMailInput | null> {
  const object = await env.R2.get(key);
  if (!object) return null;

  const payload = (await object.json()) as StoredPayload;
  const attachments = [];

  for (const item of payload.attachments ?? []) {
    const file = await env.R2.get(item.r2Key);
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
 * 邮件终态后清理 R2 中的发送载荷。
 * 键里含年月分区，无法由 id 直接推出，所以从落库的 payloadKey 反推目录前缀；
 * 旧结构（outbound/{id}/…）也能被同一段逻辑覆盖。
 */
export async function deletePayload(env: Env, payloadKey: string | null): Promise<void> {
  if (!payloadKey) return;
  const listed = await env.R2.list({ prefix: dirPrefix(payloadKey) });
  if (!listed.objects.length) return;
  await env.R2.delete(listed.objects.map((object) => object.key));
}
