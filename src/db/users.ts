import type { Env } from "../env";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { newId, randomToken } from "../lib/id";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  isEnabled: boolean;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  password_salt: string;
  role: string;
  is_enabled: number;
  created_at: string;
}

const SESSION_TTL_MS = 30 * 86_400_000;

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role === "admin" ? "admin" : "user",
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
  };
}

export async function countUsers(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users`).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createUser(
  env: Env,
  input: { email: string; password: string; name?: string; role?: "admin" | "user" },
): Promise<UserRecord> {
  const email = input.email.trim().toLowerCase();
  const { hash, salt } = await hashPassword(input.password);
  const id = newId("usr");

  await env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, password_salt, role) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(id, email, input.name ?? null, hash, salt, input.role ?? "user")
    .run();

  const user = await getUser(env, id);
  if (!user) throw new Error("用户创建失败");
  return user;
}

export async function getUser(env: Env, id: string): Promise<UserRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ? toRecord(row) : null;
}

export async function getUserByEmail(env: Env, email: string): Promise<UserRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
  return row ? toRecord(row) : null;
}

export async function authenticate(env: Env, email: string, password: string): Promise<UserRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
  // biome-ignore lint/complexity/useOptionalChain: 认证路径上「账号不存在」和「账号被停用」分开写更一目了然
  if (!row || row.is_enabled !== 1) return null;

  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  return ok ? toRecord(row) : null;
}

export async function changePassword(env: Env, userId: string, password: string): Promise<void> {
  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`)
    .bind(hash, salt, userId)
    .run();
  // 改密后作废该用户所有会话
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
}

export async function createSession(env: Env, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(await sha256Hex(token), userId, expiresAt.toISOString())
    .run();

  return { token, expiresAt };
}

export async function resolveSession(env: Env, token: string): Promise<UserRecord | null> {
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ? AND u.is_enabled = 1`,
  )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<UserRow>();
  return row ? toRecord(row) : null;
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`)
    .bind(await sha256Hex(token))
    .run();
}
