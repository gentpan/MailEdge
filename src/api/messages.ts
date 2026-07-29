import { Hono } from "hono";
import { createMailbox, deleteMailbox, listMailboxes, mailboxStub } from "../db/mailboxes";
import type { MailboxRecord } from "../db/mailboxes";
import type { Env } from "../env";
import type { MailFolder } from "../shared/message";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const messages = new Hono<AppContext>();
messages.use("*", requireAuth);

/** 前端用 "all" 表示聚合所有信箱 */
const ALL = "all";

async function resolveMailbox(
  env: Env,
  userId: string,
  mailboxId: string | undefined,
): Promise<MailboxRecord | null> {
  const mailboxes = await listMailboxes(env, userId);
  if (!mailboxes.length) return null;
  if (!mailboxId || mailboxId === ALL) return mailboxes[0] ?? null;
  return mailboxes.find((item) => item.id === mailboxId) ?? null;
}

/**
 * 聚合视图：并行查每个信箱，再按时间归并。
 * 每个信箱内部已按 received_at 倒序，所以各取 limit 条、合并后截断即可，
 * 下一页各信箱都用同一个时间游标继续取——这是标准的多路归并分页。
 */
async function listAcrossMailboxes(
  env: Env,
  mailboxes: MailboxRecord[],
  params: { folder?: MailFolder; limit: number; before?: string; search?: string },
) {
  const pages = await Promise.all(
    mailboxes.map(async (mailbox) => {
      const result = await mailboxStub(env, mailbox).list(params);
      return result.items.map((item) => ({
        ...item,
        mailboxId: mailbox.id,
        mailboxAddress: mailbox.address,
      }));
    }),
  );

  const merged = pages.flat().sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const items = merged.slice(0, params.limit);
  const hasMore = merged.length > params.limit;

  return { items, nextCursor: hasMore ? (items.at(-1)?.receivedAt ?? null) : null };
}

messages.get("/mailboxes", async (c) => {
  return c.json({ mailboxes: await listMailboxes(c.env, c.get("user").id) });
});

messages.post("/mailboxes", async (c) => {
  const body = await c.req.json<{ address: string; displayName?: string; isCatchAll?: boolean }>();
  if (!body.address?.includes("@")) return c.json({ error: "邮箱地址格式不正确" }, 400);

  try {
    const mailbox = await createMailbox(c.env, {
      address: body.address,
      userId: c.get("user").id,
      displayName: body.displayName,
      isCatchAll: body.isCatchAll,
    });
    return c.json({ mailbox });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建失败";
    return c.json({ error: /UNIQUE/i.test(message) ? "该地址已存在" : message }, 400);
  }
});

messages.delete("/mailboxes/:id", async (c) => {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.param("id"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);
  await deleteMailbox(c.env, mailbox.id);
  return c.json({ ok: true });
});

messages.get("/stats", async (c) => {
  const userId = c.get("user").id;
  const requested = c.req.query("mailboxId");

  if (requested === ALL) {
    const mailboxes = await listMailboxes(c.env, userId);
    const all = await Promise.all(mailboxes.map((mailbox) => mailboxStub(c.env, mailbox).stats()));

    // 各信箱的同名文件夹相加
    const totals = new Map<string, { folder: MailFolder; total: number; unread: number }>();
    for (const stats of all) {
      for (const item of stats) {
        const current = totals.get(item.folder) ?? { folder: item.folder, total: 0, unread: 0 };
        current.total += item.total;
        current.unread += item.unread;
        totals.set(item.folder, current);
      }
    }
    return c.json({ stats: [...totals.values()] });
  }

  const mailbox = await resolveMailbox(c.env, userId, requested);
  if (!mailbox) return c.json({ stats: [] });
  return c.json({ stats: await mailboxStub(c.env, mailbox).stats() });
});

messages.get("/messages", async (c) => {
  const userId = c.get("user").id;
  const requested = c.req.query("mailboxId");
  const params = {
    folder: (c.req.query("folder") as MailFolder | undefined) ?? "inbox",
    limit: Math.min(Number(c.req.query("limit") ?? 50), 200),
    before: c.req.query("before"),
    search: c.req.query("q"),
  };

  if (requested === ALL) {
    const mailboxes = await listMailboxes(c.env, userId);
    if (!mailboxes.length) return c.json({ items: [], nextCursor: null });
    return c.json(await listAcrossMailboxes(c.env, mailboxes, params));
  }

  const mailbox = await resolveMailbox(c.env, userId, requested);
  if (!mailbox) return c.json({ items: [], nextCursor: null });

  const result = await mailboxStub(c.env, mailbox).list(params);
  return c.json({
    ...result,
    items: result.items.map((item) => ({
      ...item,
      mailboxId: mailbox.id,
      mailboxAddress: mailbox.address,
    })),
  });
});

messages.get("/messages/:id", async (c) => {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.query("mailboxId"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);

  const stub = mailboxStub(c.env, mailbox);
  const detail = await stub.get(c.req.param("id"));
  if (!detail) return c.json({ error: "邮件不存在" }, 404);

  if (!detail.isRead) await stub.setRead(detail.id, true);
  return c.json({ message: { ...detail, isRead: true } });
});

messages.patch("/messages/:id", async (c) => {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.query("mailboxId"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);

  const body = await c.req.json<{ isRead?: boolean; isStarred?: boolean; folder?: MailFolder }>();
  const stub = mailboxStub(c.env, mailbox);
  const id = c.req.param("id");

  if (body.isRead !== undefined) await stub.setRead(id, body.isRead);
  if (body.isStarred !== undefined) await stub.setStarred(id, body.isStarred);
  if (body.folder) await stub.move(id, body.folder);

  return c.json({ ok: true });
});

messages.delete("/messages/:id", async (c) => {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.query("mailboxId"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);

  const stub = mailboxStub(c.env, mailbox);
  const id = c.req.param("id");
  const detail = await stub.get(id);
  if (!detail) return c.json({ error: "邮件不存在" }, 404);

  // 第一次删除进回收站，回收站里再删才真正清理
  if (detail.folder !== "trash") {
    await stub.move(id, "trash");
    return c.json({ ok: true, moved: true });
  }

  const keys = await stub.purge(id);
  if (keys.length) await c.env.R2.delete(keys);
  return c.json({ ok: true, purged: true });
});

messages.get("/messages/:id/attachments/:attachmentId", async (c) => {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.query("mailboxId"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);

  const attachment = await mailboxStub(c.env, mailbox).getAttachment(
    c.req.param("id"),
    c.req.param("attachmentId"),
  );
  if (!attachment?.r2Key) return c.json({ error: "附件不存在" }, 404);

  const object = await c.env.R2.get(attachment.r2Key);
  if (!object) return c.json({ error: "附件已被清理" }, 410);

  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Length": attachment.size.toString(),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});

export default messages;
