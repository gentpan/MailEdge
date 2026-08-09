import { Hono } from "hono";
import { createContact, deleteContact, getContact, listContacts, updateContact } from "../db/contacts";
import { createFolder, deleteFolder, getFolder, listFolders, renameFolder } from "../db/folders";
import type { MailboxRecord } from "../db/mailboxes";
import {
  CatchAllConflictError,
  CatchAllDeleteProtectedError,
  createMailbox,
  deleteMailbox,
  listMailboxes,
  mailboxStub,
  updateMailboxSettings,
} from "../db/mailboxes";
import type { Env } from "../env";
import type { MailFolder, SystemMailFolder } from "../shared/message";
import { createObjectStorage } from "../storage";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const messages = new Hono<AppContext>();
messages.use("*", requireAuth);

/** 前端用 "all" 表示聚合所有信箱 */
const ALL = "all";
const SYSTEM_FOLDERS = new Set<SystemMailFolder>([
  "inbox",
  "sent",
  "drafts",
  "archive",
  "spam",
  "trash",
  "catchall",
]);

function isSystemFolder(folder: string): folder is SystemMailFolder {
  return SYSTEM_FOLDERS.has(folder as SystemMailFolder);
}

async function canUseFolder(env: Env, userId: string, folder: string): Promise<boolean> {
  return isSystemFolder(folder) || Boolean(await getFolder(env, userId, folder));
}

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
  params: { folder?: MailFolder; category?: string; limit: number; before?: string; search?: string },
) {
  // 每个信箱多取一条来判断「是否还有下一页」：否则两个信箱恰好凑满 limit 时
  // merged.length === limit 会被误判为没有更多，分页提前终止
  const pages = await Promise.all(
    mailboxes.map(async (mailbox) => {
      const result = await mailboxStub(env, mailbox).list({ ...params, limit: params.limit + 1 });
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

messages.get("/folders", async (c) => {
  return c.json({ folders: await listFolders(c.env, c.get("user").id) });
});

messages.post("/folders", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  try {
    const folder = await createFolder(c.env, c.get("user").id, body.name ?? "");
    return c.json({ folder });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "文件夹创建失败" }, 400);
  }
});

messages.patch("/folders/:id", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  try {
    const folder = await renameFolder(c.env, c.get("user").id, c.req.param("id"), body.name ?? "");
    return c.json({ folder });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "文件夹更新失败" }, 400);
  }
});

messages.delete("/folders/:id", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");
  const folder = await getFolder(c.env, userId, id);
  if (!folder) return c.json({ error: "文件夹不存在" }, 404);

  // 先迁移邮件，再删除名称记录，保证删除自定义文件夹不会丢失邮件。
  const mailboxes = await listMailboxes(c.env, userId);
  await Promise.all(mailboxes.map((mailbox) => mailboxStub(c.env, mailbox).moveFolder(id)));
  await deleteFolder(c.env, userId, id);
  return c.json({ ok: true, folder });
});

/** 联系人：只允许访问当前登录账户自己的联系人。 */
messages.get("/contacts", async (c) => {
  return c.json({ contacts: await listContacts(c.env, c.get("user").id) });
});

messages.get("/contacts/:id", async (c) => {
  const contact = await getContact(c.env, c.get("user").id, c.req.param("id"));
  return contact ? c.json({ contact }) : c.json({ error: "联系人不存在" }, 404);
});

messages.post("/contacts", async (c) => {
  const body = await c.req.json<{ email?: string; name?: string; company?: string; notes?: string }>();
  try {
    const contact = await createContact(c.env, c.get("user").id, body);
    return c.json({ contact }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "联系人创建失败";
    return c.json({ error: /UNIQUE/i.test(message) ? "该邮箱已经在联系人中" : message }, 400);
  }
});

messages.patch("/contacts/:id", async (c) => {
  const body = await c.req.json<{ email?: string; name?: string; company?: string; notes?: string }>();
  try {
    const contact = await updateContact(c.env, c.get("user").id, c.req.param("id"), body);
    return c.json({ contact });
  } catch (error) {
    const message = error instanceof Error ? error.message : "联系人更新失败";
    return c.json({ error: /UNIQUE/i.test(message) ? "该邮箱已经在联系人中" : message }, 400);
  }
});

messages.delete("/contacts/:id", async (c) => {
  const deleted = await deleteContact(c.env, c.get("user").id, c.req.param("id"));
  return deleted ? c.json({ ok: true }) : c.json({ error: "联系人不存在" }, 404);
});

/** 实时推送：把 WebSocket 升级请求转发给对应信箱的 Durable Object */
messages.get("/mailboxes/:id/stream", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") return c.json({ error: "expected websocket" }, 426);
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.param("id"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);
  return mailboxStub(c.env, mailbox).fetch(c.req.raw);
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
    if (error instanceof CatchAllConflictError) {
      return c.json({ error: error.message, code: error.code }, 409);
    }
    const message = error instanceof Error ? error.message : "创建失败";
    return c.json({ error: /UNIQUE|该地址已存在/i.test(message) ? "该地址已存在" : message }, 400);
  }
});

messages.patch("/mailboxes/:id", async (c) => {
  const body = await c.req.json<{ displayName?: string | null; isCatchAll?: boolean }>();
  const hasDisplayName = Object.hasOwn(body, "displayName");
  const raw = typeof body.displayName === "string" ? body.displayName.trim().replace(/\s+/g, " ") : null;
  if (raw && raw.length > 40) return c.json({ error: "邮箱名称不能超过 40 个字符" }, 400);
  if (body.isCatchAll !== undefined && typeof body.isCatchAll !== "boolean") {
    return c.json({ error: "兜底信箱状态不正确" }, 400);
  }
  try {
    const mailbox = await updateMailboxSettings(c.env, c.get("user").id, c.req.param("id"), {
      ...(hasDisplayName ? { displayName: raw } : {}),
      ...(body.isCatchAll !== undefined ? { isCatchAll: body.isCatchAll } : {}),
    });
    if (!mailbox) return c.json({ error: "信箱不存在" }, 404);
    return c.json({ mailbox });
  } catch (error) {
    if (error instanceof CatchAllConflictError) {
      return c.json({ error: error.message, code: error.code }, 409);
    }
    throw error;
  }
});

messages.delete("/mailboxes/:id", async (c) => {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.param("id"));
  if (!mailbox) return c.json({ error: "信箱不存在" }, 404);
  try {
    await deleteMailbox(c.env, mailbox.id, {
      allowCatchAll: c.req.query("confirmCatchAll") === "true",
    });
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof CatchAllDeleteProtectedError) {
      return c.json({ error: error.message, code: error.code }, 409);
    }
    throw error;
  }
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
  if (requested && requested !== ALL && !mailbox) return c.json({ error: "信箱不存在" }, 404);
  if (!mailbox) return c.json({ stats: [] });
  return c.json({ stats: await mailboxStub(c.env, mailbox).stats() });
});

messages.get("/messages", async (c) => {
  const userId = c.get("user").id;
  const requested = c.req.query("mailboxId");
  const requestedLimit = Number(c.req.query("limit") ?? 25);
  const params = {
    folder: (c.req.query("folder") as MailFolder | undefined) ?? "inbox",
    category: c.req.query("category") || undefined,
    limit: Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 25, 1), 200),
    before: c.req.query("before"),
    search: c.req.query("q"),
  };

  if (params.folder && !(await canUseFolder(c.env, userId, params.folder))) {
    return c.json({ error: "文件夹不存在" }, 400);
  }

  if (requested === ALL) {
    const mailboxes = await listMailboxes(c.env, userId);
    if (!mailboxes.length) return c.json({ items: [], nextCursor: null });
    return c.json(await listAcrossMailboxes(c.env, mailboxes, params));
  }

  const mailbox = await resolveMailbox(c.env, userId, requested);
  if (requested && requested !== ALL && !mailbox) return c.json({ error: "信箱不存在" }, 404);
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

messages.post("/messages/read-all", async (c) => {
  const userId = c.get("user").id;
  const requested = c.req.query("mailboxId");
  const body = await c.req.json<{ folder?: MailFolder }>();
  const folder = body.folder ?? "inbox";
  if (!(await canUseFolder(c.env, userId, folder))) return c.json({ error: "文件夹不存在" }, 400);

  if (requested === ALL) {
    const mailboxes = await listMailboxes(c.env, userId);
    await Promise.all(mailboxes.map((mailbox) => mailboxStub(c.env, mailbox).markAllRead(folder)));
    return c.json({ ok: true });
  }

  const mailbox = await resolveMailbox(c.env, userId, requested);
  if (requested && requested !== ALL && !mailbox) return c.json({ error: "信箱不存在" }, 404);
  if (mailbox) await mailboxStub(c.env, mailbox).markAllRead(folder);
  return c.json({ ok: true });
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
  if (body.folder && !(await canUseFolder(c.env, c.get("user").id, body.folder))) {
    return c.json({ error: "文件夹不存在" }, 400);
  }
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
  if (keys.length) await (await createObjectStorage(c.env)).delete(keys);
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

  const object = await (await createObjectStorage(c.env)).get(attachment.r2Key);
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
