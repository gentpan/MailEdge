import { Hono } from "hono";
import { listAllMailboxes, listMailboxes, mailboxStub } from "../db/mailboxes";
import type { Env } from "../env";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const usage = new Hono<AppContext>();
usage.use("*", requireAuth);

/**
 * 返回 Dashboard 使用量。Cloudflare Worker 内无法读取账户账单 API，
 * 因此 D1/DO/R2 均显示绑定内可读取的近似值，并明确标记 R2 是否扫描完整。
 */
usage.get("/", async (c) => {
  const user = c.get("user");
  const all = user.role === "admin";
  const mailboxes = all ? await listAllMailboxes(c.env) : await listMailboxes(c.env, user.id);
  const mailboxUsage = await Promise.all(
    mailboxes.map(async (mailbox) => ({ mailbox, usage: await mailboxStub(c.env, mailbox).usage() })),
  );

  const d1 = await collectD1Usage(c.env, user.id, all);
  const r2 = await collectR2Usage(c.env, mailboxes, user.id, all);
  const sqliteValues = mailboxUsage.map((item) => item.usage.sqliteBytes);
  const sqliteBytes =
    sqliteValues.length && sqliteValues.every((value) => value !== null)
      ? sqliteValues.reduce((sum, value) => sum + (value ?? 0), 0)
      : null;

  return c.json({
    scope: all ? "instance" : "account",
    d1,
    durableObjects: {
      mailboxCount: mailboxUsage.length,
      messageCount: mailboxUsage.reduce((sum, item) => sum + item.usage.messages, 0),
      attachmentCount: mailboxUsage.reduce((sum, item) => sum + item.usage.attachments, 0),
      archivedMessageCount: mailboxUsage.reduce((sum, item) => sum + item.usage.archivedMessages, 0),
      sqliteBytes,
      bodyBytesInSqlite: mailboxUsage.reduce((sum, item) => sum + item.usage.bodyBytesInSqlite, 0),
    },
    r2,
    updatedAt: new Date().toISOString(),
  });
});

async function collectD1Usage(
  env: Env,
  userId: string,
  all: boolean,
): Promise<{
  sizeBytes: number | null;
  pageCount: number | null;
  pageSize: number | null;
  totalRows: number;
  rows: Record<string, number>;
}> {
  let pageCount: number | null = null;
  let pageSize: number | null = null;
  try {
    const [countRow, sizeRow] = await Promise.all([
      env.DB.prepare(`PRAGMA page_count`).first<{ page_count: number }>(),
      env.DB.prepare(`PRAGMA page_size`).first<{ page_size: number }>(),
    ]);
    pageCount = toNumber(countRow?.page_count);
    pageSize = toNumber(sizeRow?.page_size);
  } catch {
    // D1 运行时若限制 PRAGMA，仍返回表行数和 DO/R2 数据。
  }

  const tableNames = ["users", "mailboxes", "outbound_messages", "attachment_links", "sessions", "settings"];
  const rows = Object.fromEntries(
    await Promise.all(
      tableNames.map(async (table) => {
        const userColumn = table === "users" ? "id" : table === "settings" ? null : "user_id";
        const where = !all && userColumn ? ` WHERE ${userColumn} = ?` : "";
        const statement = env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}${where}`);
        const result =
          userColumn && !all
            ? await statement.bind(userId).first<{ count: number }>()
            : await statement.first<{ count: number }>();
        return [table, toNumber(result?.count) ?? 0] as const;
      }),
    ),
  ) as Record<string, number>;

  return {
    sizeBytes: pageCount !== null && pageSize !== null ? pageCount * pageSize : null,
    pageCount,
    pageSize,
    totalRows: Object.values(rows).reduce((sum, value) => sum + value, 0),
    rows,
  };
}

async function collectR2Usage(
  env: Env,
  mailboxes: Awaited<ReturnType<typeof listMailboxes>>,
  userId: string,
  all: boolean,
): Promise<{ available: boolean; objectCount: number; bytes: number; truncated: boolean }> {
  if (!env.R2) return { available: false, objectCount: 0, bytes: 0, truncated: false };

  const prefixes = all
    ? null
    : [
        `staging/${userId}/`,
        ...mailboxes.flatMap((mailbox) => [
          `inbound/${mailbox.id}/`,
          `outbound/${mailbox.id}/`,
          `messages/${mailbox.id}/`,
          `shares/${mailbox.id}/`,
        ]),
      ];
  let cursor: string | undefined;
  let objectCount = 0;
  let bytes = 0;
  let truncated = false;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await env.R2.list({ limit: 1000, cursor });
    for (const object of result.objects) {
      if (prefixes && !prefixes.some((prefix) => object.key.startsWith(prefix))) continue;
      objectCount += 1;
      bytes += object.size;
    }
    if (!result.truncated) break;
    cursor = result.cursor;
    if (!cursor) break;
    if (page === maxPages - 1) truncated = true;
  }

  return { available: true, objectCount, bytes, truncated };
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default usage;
