import type { CredentialInfo, ExtendedAuthenticatorTransport } from "@passwordless-id/webauthn";
import type { Env } from "../env";
import { newId } from "../lib/id";

export interface PasskeyCredentialRecord extends CredentialInfo {
  userId: string;
  counter: number;
  createdAt: string;
  lastUsedAt: string | null;
}

interface CredentialRow {
  id: string;
  user_id: string;
  public_key: string;
  algorithm: string;
  transports: string;
  sign_count: number;
  created_at: string;
  last_used_at: string | null;
}

interface ChallengeRow {
  id: string;
  kind: string;
  user_id: string | null;
  challenge: string;
  expires_at: string;
  used_at: string | null;
}

export interface AuthChallengeRecord {
  id: string;
  kind: "register" | "login";
  userId: string | null;
  challenge: string;
  expiresAt: string;
  usedAt: string | null;
}

function credentialFromRow(row: CredentialRow): PasskeyCredentialRecord {
  let transports: ExtendedAuthenticatorTransport[] = [];
  try {
    const parsed = JSON.parse(row.transports) as unknown;
    if (Array.isArray(parsed)) {
      transports = parsed.filter(
        (value): value is ExtendedAuthenticatorTransport => typeof value === "string",
      );
    }
  } catch {
    // 坏的 transports 不影响凭据验证，WebAuthn 允许省略该字段。
  }

  const algorithm = row.algorithm === "RS256" ? "RS256" : "ES256";
  return {
    id: row.id,
    publicKey: row.public_key,
    algorithm,
    transports,
    userId: row.user_id,
    counter: row.sign_count,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

function challengeFromRow(row: ChallengeRow): AuthChallengeRecord | null {
  if (row.kind !== "register" && row.kind !== "login") return null;
  return {
    id: row.id,
    kind: row.kind,
    userId: row.user_id,
    challenge: row.challenge,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

export async function listPasskeyCredentials(env: Env, userId: string): Promise<PasskeyCredentialRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<CredentialRow>();
  return results.map(credentialFromRow);
}

export async function getPasskeyCredential(env: Env, id: string): Promise<PasskeyCredentialRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM passkey_credentials WHERE id = ?`)
    .bind(id)
    .first<CredentialRow>();
  return row ? credentialFromRow(row) : null;
}

export async function createPasskeyCredential(
  env: Env,
  input: {
    id: string;
    userId: string;
    publicKey: string;
    algorithm: string;
    transports: string[];
    counter: number;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO passkey_credentials (id, user_id, public_key, algorithm, transports, sign_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.userId,
      input.publicKey,
      input.algorithm,
      JSON.stringify(input.transports),
      input.counter,
    )
    .run();
}

export async function updatePasskeyCounter(env: Env, id: string, counter: number): Promise<void> {
  await env.DB.prepare(`UPDATE passkey_credentials SET sign_count = ?, last_used_at = ? WHERE id = ?`)
    .bind(counter, new Date().toISOString(), id)
    .run();
}

export async function createAuthChallenge(
  env: Env,
  input: { kind: "register" | "login"; userId?: string | null; challenge: string; expiresAt: string },
): Promise<void> {
  await env.DB.prepare(`DELETE FROM auth_challenges WHERE expires_at <= ? OR used_at IS NOT NULL`)
    .bind(new Date().toISOString())
    .run();
  await env.DB.prepare(
    `INSERT INTO auth_challenges (id, kind, user_id, challenge, expires_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(newId("challenge"), input.kind, input.userId ?? null, input.challenge, input.expiresAt)
    .run();
}

export async function getAuthChallenge(
  env: Env,
  input: { kind: "register" | "login"; challenge: string; userId?: string | null },
): Promise<AuthChallengeRecord | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM auth_challenges
     WHERE challenge = ? AND kind = ? AND (user_id = ? OR (user_id IS NULL AND ? IS NULL))
       AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(input.challenge, input.kind, input.userId ?? null, input.userId ?? null, new Date().toISOString())
    .first<ChallengeRow>();
  return row ? challengeFromRow(row) : null;
}

export async function consumeAuthChallenge(env: Env, id: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE auth_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(new Date().toISOString(), id, new Date().toISOString())
    .run();
  return result.meta.changes === 1;
}
