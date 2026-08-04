import { Hono } from "hono";
import { listMailboxes, mailboxStub } from "../db/mailboxes";
import type { Env } from "../env";
import { randomToken } from "../lib/id";
import { safeName } from "../lib/r2key";
import { createObjectStorage, MAX_KV_VALUE_BYTES, type StorageObjectBody } from "../storage";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const attachments = new Hono<AppContext>();
attachments.use("*", requireAuth);

interface ShareRow {
  token: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size: number;
  message_id: string | null;
  downloads: number;
  is_revoked: number;
  expires_at: string | null;
  created_at: string;
}

interface MessageAttachmentRef {
  source: "message";
  mailboxId: string;
  messageId: string;
  attachmentId: string;
}

interface ShareAttachmentRef {
  source: "share";
  token: string;
}

type AttachmentRef = MessageAttachmentRef | ShareAttachmentRef;

/** 列出当前账户所有已归档的对象存储附件（收到、已发送和分享附件）。 */
attachments.get("/", async (c) => {
  const userId = c.get("user").id;
  const mailboxes = await listMailboxes(c.env, userId);
  const mailboxItems = await Promise.all(
    mailboxes.map(async (mailbox) => {
      const rows = await mailboxStub(c.env, mailbox).listAttachments(1000);
      return rows.map((row) => ({
        id: row.id,
        source: "message" as const,
        mailboxId: mailbox.id,
        mailboxAddress: mailbox.address,
        messageId: row.messageId,
        messageSubject: row.subject,
        filename: row.filename,
        contentType: row.contentType,
        size: row.size,
        direction: row.direction,
        folder: row.folder,
        mode: row.mode,
        uploadedAt: row.receivedAt,
        downloadUrl: `/api/messages/${encodeURIComponent(row.messageId)}/attachments/${encodeURIComponent(row.id)}?mailboxId=${encodeURIComponent(mailbox.id)}`,
        token: null,
        expired: false,
        revoked: false,
      }));
    }),
  );

  const { results: shareRows } = await c.env.DB.prepare(
    `SELECT token, r2_key, filename, content_type, size, message_id, downloads, is_revoked, expires_at, created_at
     FROM attachment_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 1000`,
  )
    .bind(userId)
    .all<ShareRow>();
  const now = Date.now();
  const shareItems = shareRows.map((row) => ({
    id: row.token,
    source: "share" as const,
    mailboxId: null,
    mailboxAddress: null,
    messageId: row.message_id,
    messageSubject: null,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    direction: "outbound" as const,
    folder: "sent" as const,
    mode: "link" as const,
    uploadedAt: row.created_at,
    downloadUrl: `/d/${encodeURIComponent(row.token)}`,
    token: row.token,
    downloads: row.downloads,
    expiresAt: row.expires_at,
    expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() < now),
    revoked: row.is_revoked === 1,
  }));

  const items = [...mailboxItems.flat(), ...shareItems]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 2000);
  return c.json({ attachments: items, total: items.length });
});

/** 将已归档附件复制到当前用户的写信暂存区，供“插入到邮件”使用。 */
attachments.post("/stage", async (c) => {
  const body = await c.req.json<AttachmentRef>().catch(() => null);
  if (!body || !isAttachmentRef(body)) return c.json({ error: "附件引用无效" }, 400);

  const resolved = await resolveObject(c.env, c.get("user").id, body);
  if (!resolved) return c.json({ error: "附件不存在或已被删除" }, 404);
  if (!resolved.object) return c.json({ error: "附件文件已被清理" }, 410);

  const token = randomToken(24);
  const key = `staging/${c.get("user").id}/${token}/${safeName(resolved.filename, 120)}`;
  const objectStorage = await createObjectStorage(c.env);
  if (objectStorage.backend === "kv" && resolved.size > MAX_KV_VALUE_BYTES) {
    return c.json({ error: "当前使用 KV 存储，单个附件不能超过 25MB" }, 413);
  }
  await objectStorage.put(key, resolved.object.body, {
    httpMetadata: { contentType: resolved.contentType },
    size: resolved.size,
  });
  return c.json({
    token,
    filename: resolved.filename,
    contentType: resolved.contentType,
    size: resolved.size,
  });
});

/** 删除附件文件及其管理元数据。删除后历史邮件中的附件将不可再下载。 */
attachments.delete("/", async (c) => {
  const body = await c.req.json<AttachmentRef>().catch(() => null);
  if (!body || !isAttachmentRef(body)) return c.json({ error: "附件引用无效" }, 400);
  const userId = c.get("user").id;

  if (body.source === "message") {
    const mailboxes = await listMailboxes(c.env, userId);
    const mailbox = mailboxes.find((item) => item.id === body.mailboxId);
    if (!mailbox) return c.json({ error: "信箱不存在" }, 404);
    const stub = mailboxStub(c.env, mailbox);
    const item = await stub.getAttachment(body.messageId, body.attachmentId);
    if (!item?.r2Key) return c.json({ error: "附件不存在或已被删除" }, 404);
    await (await createObjectStorage(c.env)).delete(item.r2Key);
    await stub.deleteAttachment(body.messageId, body.attachmentId);
    return c.json({ ok: true });
  }

  const row = await c.env.DB.prepare(
    `SELECT token, r2_key FROM attachment_links WHERE token = ? AND user_id = ?`,
  )
    .bind(body.token, userId)
    .first<Pick<ShareRow, "token" | "r2_key">>();
  if (!row) return c.json({ error: "附件不存在或已被删除" }, 404);

  await (await createObjectStorage(c.env)).delete(row.r2_key);
  await c.env.DB.prepare(`DELETE FROM attachment_links WHERE token = ? AND user_id = ?`)
    .bind(body.token, userId)
    .run();
  const mailboxes = await listMailboxes(c.env, userId);
  await Promise.all(
    mailboxes.map((mailbox) => mailboxStub(c.env, mailbox).deleteAttachmentByToken(body.token)),
  );
  return c.json({ ok: true });
});

function isAttachmentRef(value: unknown): value is AttachmentRef {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.source === "share") return typeof item.token === "string" && item.token.length > 0;
  return (
    item.source === "message" &&
    typeof item.mailboxId === "string" &&
    typeof item.messageId === "string" &&
    typeof item.attachmentId === "string"
  );
}

async function resolveObject(
  env: Env,
  userId: string,
  ref: AttachmentRef,
): Promise<{
  object: StorageObjectBody | null;
  filename: string;
  contentType: string;
  size: number;
} | null> {
  if (ref.source === "message") {
    const mailbox = (await listMailboxes(env, userId)).find((item) => item.id === ref.mailboxId);
    if (!mailbox) return null;
    const attachment = await mailboxStub(env, mailbox).getAttachment(ref.messageId, ref.attachmentId);
    if (!attachment?.r2Key) return null;
    const object = await (await createObjectStorage(env)).get(attachment.r2Key);
    return object
      ? {
          object,
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
        }
      : {
          object: null,
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
        };
  }

  const row = await env.DB.prepare(
    `SELECT token, r2_key, filename, content_type, size, is_revoked, expires_at
     FROM attachment_links WHERE token = ? AND user_id = ?`,
  )
    .bind(ref.token, userId)
    .first<
      Pick<ShareRow, "token" | "r2_key" | "filename" | "content_type" | "size" | "is_revoked" | "expires_at">
    >();
  if (!row || row.is_revoked === 1 || (row.expires_at && new Date(row.expires_at).getTime() < Date.now()))
    return null;
  const object = await (await createObjectStorage(env)).get(row.r2_key);
  return object
    ? { object, filename: row.filename, contentType: row.content_type, size: row.size }
    : { object: null, filename: row.filename, contentType: row.content_type, size: row.size };
}

export default attachments;
