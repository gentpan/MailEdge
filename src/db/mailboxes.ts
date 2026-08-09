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

export class CatchAllConflictError extends Error {
  readonly code = "CATCH_ALL_CONFLICT";

  constructor(
    readonly domain: string,
    readonly address: string,
  ) {
    super(`域名 ${domain} 已由 ${address} 接收未匹配邮件`);
    this.name = "CatchAllConflictError";
  }
}

export class CatchAllDeleteProtectedError extends Error {
  readonly code = "CATCH_ALL_DELETE_PROTECTED";

  constructor(readonly mailbox: MailboxRecord) {
    super(`删除 ${mailbox.address} 后，${mailbox.domain} 将不再接收未匹配邮件`);
    this.name = "CatchAllDeleteProtectedError";
  }
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

export async function getCatchAllByDomain(env: Env, domain: string): Promise<MailboxRecord | null> {
  const row = await env.DB.prepare(`SELECT * FROM mailboxes WHERE domain = ? AND is_catch_all = 1 LIMIT 1`)
    .bind(domain.trim().toLowerCase())
    .first<MailboxRow>();
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

/** 定时任务使用：遍历实例中的全部信箱，不向普通 API 暴露跨账户数据。 */
export async function listAllMailboxes(env: Env): Promise<MailboxRecord[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM mailboxes ORDER BY created_at ASC`,
  ).all<MailboxRow>();
  return results.map(toRecord);
}

export async function createMailbox(
  env: Env,
  input: { address: string; userId: string; displayName?: string; isCatchAll?: boolean },
): Promise<MailboxRecord> {
  const address = input.address.trim().toLowerCase();
  const domain = address.split("@")[1];
  if (!domain) throw new Error("邮箱地址格式不正确");

  const duplicateAddress = await env.DB.prepare(`SELECT id FROM mailboxes WHERE address = ?`)
    .bind(address)
    .first<{ id: string }>();
  if (duplicateAddress) throw new Error("该地址已存在");

  if (input.isCatchAll) {
    const current = await getCatchAllByDomain(env, domain);
    if (current) throw new CatchAllConflictError(domain, current.address);
  }

  const id = newId("mb");
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (input.isCatchAll && /mailboxes\.domain|one_catchall/i.test(message)) {
      const current = await getCatchAllByDomain(env, domain);
      if (current) throw new CatchAllConflictError(domain, current.address);
    }
    throw error;
  }

  const record = await getMailbox(env, id);
  if (!record) throw new Error("信箱创建失败");
  return record;
}

export async function deleteMailbox(
  env: Env,
  id: string,
  options: { allowCatchAll?: boolean } = {},
): Promise<void> {
  const mailbox = await getMailbox(env, id);
  if (mailbox?.isCatchAll && !options.allowCatchAll) {
    throw new CatchAllDeleteProtectedError(mailbox);
  }
  await env.DB.prepare(`DELETE FROM mailboxes WHERE id = ?`).bind(id).run();
}

export async function updateMailboxSettings(
  env: Env,
  userId: string,
  id: string,
  input: { displayName?: string | null; isCatchAll?: boolean },
): Promise<MailboxRecord | null> {
  const currentRow = await env.DB.prepare(`SELECT * FROM mailboxes WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<MailboxRow>();
  if (!currentRow) return null;

  const current = toRecord(currentRow);
  const displayName = input.displayName === undefined ? current.displayName : input.displayName;
  const isCatchAll = input.isCatchAll === undefined ? current.isCatchAll : input.isCatchAll;

  if (isCatchAll) {
    const existingCatchAll = await getCatchAllByDomain(env, current.domain);
    if (existingCatchAll && existingCatchAll.id !== current.id && existingCatchAll.userId !== userId) {
      // 同一域名只能有一个兜底信箱；普通用户不能替换其他账户持有的兜底信箱。
      throw new CatchAllConflictError(current.domain, existingCatchAll.address);
    }

    // D1 batch 具备事务语义：先撤销同域名旧兜底，再启用当前信箱，不暴露中间状态。
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE mailboxes SET is_catch_all = 0 WHERE domain = ? AND id != ? AND is_catch_all = 1`,
      ).bind(current.domain, current.id),
      env.DB.prepare(
        `UPDATE mailboxes SET display_name = ?, is_catch_all = 1 WHERE id = ? AND user_id = ?`,
      ).bind(displayName, current.id, userId),
    ]);
  } else {
    await env.DB.prepare(
      `UPDATE mailboxes SET display_name = ?, is_catch_all = 0 WHERE id = ? AND user_id = ?`,
    )
      .bind(displayName, current.id, userId)
      .run();
  }

  const row = await env.DB.prepare(`SELECT * FROM mailboxes WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<MailboxRow>();
  return row ? toRecord(row) : null;
}
