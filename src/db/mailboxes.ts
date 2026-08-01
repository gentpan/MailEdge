import type { MailboxDO } from "../do/mailbox";
import type { Env } from "../env";
import { newId } from "../lib/id";

export interface MailboxRecord {
  id: string;
  address: string;
  displayName: string | null;
  userId: string;
  doName: string;
  isCatchAll: boolean;
  domain: string;
  createdAt: string;
}

interface MailboxRow {
  id: string;
  address: string;
  display_name: string | null;
  user_id: string;
  do_name: string;
  is_catch_all: number;
  domain: string;
  created_at: string;
}

function toRecord(row: MailboxRow): MailboxRecord {
  return {
    id: row.id,
    address: row.address,
    displayName: row.display_name,
    userId: row.user_id,
    doName: row.do_name,
    isCatchAll: row.is_catch_all === 1,
    domain: row.domain,
    createdAt: row.created_at,
  };
}

export function mailboxStub(env: Env, mailbox: MailboxRecord): DurableObjectStub<MailboxDO> {
  return env.MAILBOX.get(env.MAILBOX.idFromName(mailbox.doName));
}

export interface AddressMatch {
  mailbox: MailboxRecord;
  /** true = 该地址被精确登记过；false = 靠域名的兜底信箱兜住的 */
  exact: boolean;
}

export async function findByAddress(env: Env, address: string): Promise<AddressMatch | null> {
  const normalized = address.trim().toLowerCase();
  const row = await env.DB.prepare(`SELECT * FROM mailboxes WHERE address = ?`)
    .bind(normalized)
    .first<MailboxRow>();
  if (row) return { mailbox: toRecord(row), exact: true };

  // 未精确匹配时回落到该域名的 catch-all 信箱
  const domain = normalized.split("@")[1];
  if (!domain) return null;
  const fallback = await env.DB.prepare(
    `SELECT * FROM mailboxes WHERE domain = ? AND is_catch_all = 1 LIMIT 1`,
  )
    .bind(domain)
    .first<MailboxRow>();
  return fallback ? { mailbox: toRecord(fallback), exact: false } : null;
}

export async function getMailbox(env: Env, id: string): Promise<MailboxRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM mailboxes WHERE id = ?`).bind(id).first<MailboxRow>();
  return row ? toRecord(row) : null;
}

export async function listMailboxes(env: Env, userId: string): Promise<MailboxRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM mailboxes WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<MailboxRow>();
  return results.map(toRecord);
}

export async function createMailbox(
  env: Env,
  input: { address: string; userId: string; displayName?: string; isCatchAll?: boolean },
): Promise<MailboxRecord> {
  const address = input.address.trim().toLowerCase();
  const domain = address.split("@")[1];
  if (!domain) throw new Error("邮箱地址格式不正确");

  const id = newId("mb");
  await env.DB.prepare(
    `INSERT INTO mailboxes (id, address, display_name, user_id, do_name, is_catch_all, domain)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      id,
      address,
      input.displayName ?? null,
      input.userId,
      `mailbox:${address}`,
      input.isCatchAll ? 1 : 0,
      domain,
    )
    .run();

  const record = await getMailbox(env, id);
  if (!record) throw new Error("信箱创建失败");
  return record;
}

export async function deleteMailbox(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM mailboxes WHERE id = ?`).bind(id).run();
}
