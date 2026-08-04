import type { Env } from "../env";
import { newId } from "../lib/id";

interface ResetRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
}

function fromRow(row: ResetRow): PasswordResetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

export async function createPasswordResetToken(
  env: Env,
  input: { userId: string; tokenHash: string; expiresAt: string },
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?`).bind(
      input.userId,
      new Date().toISOString(),
    ),
    env.DB.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    ).bind(newId("reset"), input.userId, input.tokenHash, input.expiresAt),
  ]);
}

export async function getPasswordResetToken(
  env: Env,
  tokenHash: string,
): Promise<PasswordResetRecord | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<ResetRow>();
  return row ? fromRow(row) : null;
}

export async function consumePasswordResetToken(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(new Date().toISOString(), id, new Date().toISOString())
    .run();
  return result.meta.changes === 1;
}
