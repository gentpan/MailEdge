import type { Context } from "hono";
import { Hono } from "hono";
import { findByAddress, listMailboxes, mailboxStub } from "../db/mailboxes";
import { createOutbound, getOutbound, listOutbound, loadPayload, savePayload } from "../db/outbound";
import { getSendChain } from "../db/providers";
import type { Env } from "../env";
import { base64ToBytes } from "../lib/crypto";
import { newId, newMessageId } from "../lib/id";
import { isValidEmail } from "../mail/address";
import type { IncomingAttachment } from "../mail/attachments";
import { appendShareSection, prepareAttachments } from "../mail/attachments";
import { dispatch } from "../mail/dispatcher";
import type { MailAddress, SendMailInput } from "../mail/types";
import { markdownToEmailHtml } from "../shared/markdown";
import { clearStagedAttachments, readStagedAttachment } from "./attachment";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const send = new Hono<AppContext>();
send.use("*", requireAuth);

send.post("/send", async (c) => {
  const user = c.get("user");
  const parsed = await parseSendRequest(c);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  const { input, attachments, providerId, stagedTokens } = parsed;
  try {
    // 发件地址必须是本人持有的信箱，避免任意伪造 From
    const mailboxes = await listMailboxes(c.env, user.id);
    const mailbox = mailboxes.find((item) => item.address === input.from.email.toLowerCase());
    if (!mailbox) return c.json({ error: `发件地址 ${input.from.email} 不属于当前账户` }, 403);

    if (!input.to.length) return c.json({ error: "收件人不能为空" }, 400);
    if (!input.html && !input.text) return c.json({ error: "邮件正文不能为空" }, 400);

    // 未指定显示名时的兜底：优先信箱名称，其次所选渠道配置的发件人名称，
    // 避免收件方只看到一串裸地址
    if (!input.from.name) {
      const name = mailbox.displayName || (await providerFromName(c.env, providerId));
      if (name) input.from = { ...input.from, name };
    }

    const internalId = newMessageId();
    const bodySize = new TextEncoder().encode((input.html ?? "") + (input.text ?? "")).byteLength;

    // 智能附件：小文件真发，大文件转 R2 下载链接
    const prepared = await prepareAttachments(c.env, {
      messageId: internalId,
      userId: user.id,
      mailboxId: mailbox.id,
      attachments,
      bodySize,
    });

    const finalInput = appendShareSection({ ...input, attachments: prepared.inline }, prepared.shared);

    const payload = await savePayload(c.env, internalId, finalInput, mailbox.id);
    await createOutbound(c.env, {
      id: internalId,
      userId: user.id,
      mailboxId: mailbox.id,
      input: finalInput,
      payloadKey: payload.key,
    });

    const result = await dispatch(c.env, { internalId, input: finalInput, preferredProviderId: providerId });

    // 在「已发送」里留底
    const stub = mailboxStub(c.env, mailbox);
    await stub.store({
      id: newId("msg"),
      internalId,
      direction: "outbound",
      folder: "sent",
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo ?? null,
      subject: input.subject,
      html: finalInput.html ?? null,
      text: finalInput.text ?? null,
      headers: finalInput.headers,
      size: bodySize,
      isRead: true,
      status: result.status,
      provider: result.provider,
      error: result.error ?? null,
      attachments: [
        ...prepared.inline.map((item, index) => ({
          id: newId("att"),
          filename: item.filename,
          contentType: item.contentType,
          size: item.content.byteLength,
          mode: "inline" as const,
          // 留底引用 outbound 载荷里的附件键，前端才能下载
          r2Key: payload.attachments[index]?.r2Key ?? null,
          token: null,
        })),
        ...prepared.shared.map((item) => ({
          id: newId("att"),
          filename: item.filename,
          contentType: item.contentType,
          size: item.size,
          mode: "link" as const,
          r2Key: null,
          token: item.token,
        })),
      ],
    });

    return c.json(
      {
        internalId,
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        success: result.success,
        error: result.error,
        attempts: result.attempts,
        smartAttachments: {
          inline: prepared.inline.map((item) => ({ filename: item.filename, size: item.content.byteLength })),
          shared: prepared.shared.map((item) => ({
            filename: item.filename,
            size: item.size,
            url: item.url,
          })),
        },
      },
      result.success ? 200 : result.status === "deferred" ? 202 : 502,
    );
  } finally {
    // 无论成败，清理本次写信暂存的附件
    if (stagedTokens?.length) {
      await clearStagedAttachments(c.env, user.id, stagedTokens).catch(() => undefined);
    }
  }
});

/** 发信记录（状态机视图） */
send.get("/outbox", async (c) => {
  const records = await listOutbound(c.env, c.get("user").id, 100);
  return c.json({ messages: records });
});

send.get("/outbox/:id", async (c) => {
  const record = await getOutbound(c.env, c.req.param("id"));
  if (!record || record.userId !== c.get("user").id) return c.json({ error: "记录不存在" }, 404);
  return c.json({ message: record });
});

/** 手动重试：沿用同一个内部 ID，不会生成新邮件 */
send.post("/outbox/:id/retry", async (c) => {
  const record = await getOutbound(c.env, c.req.param("id"));
  if (!record || record.userId !== c.get("user").id) return c.json({ error: "记录不存在" }, 404);
  if (record.status === "sent") return c.json({ error: "该邮件已发送成功" }, 409);
  if (!record.payloadKey) return c.json({ error: "发送载荷已清理，无法重试" }, 409);

  const input = await loadPayload(c.env, record.payloadKey);
  if (!input) return c.json({ error: "发送载荷已过期，无法重试" }, 409);

  // 抢占重试权：只有 deferred/failed 才允许重试，避免与 cron 并发把同一封发两遍；
  // failed 记录重置计数，让失败邮件有真实的再次尝试机会
  const claimed = await c.env.DB.prepare(
    `UPDATE outbound_messages SET status = 'sending', attempts = 0, updated_at = ? WHERE id = ? AND status IN ('deferred', 'failed')`,
  )
    .bind(new Date().toISOString(), record.id)
    .run();
  if (!claimed.meta.changes) return c.json({ error: "该邮件正在发送中或状态已变化" }, 409);

  const result = await dispatch(c.env, { internalId: record.id, input });

  if (record.mailboxId) {
    const mailbox = (await listMailboxes(c.env, c.get("user").id)).find(
      (item) => item.id === record.mailboxId,
    );
    if (mailbox) {
      await mailboxStub(c.env, mailbox).updateOutboundStatus(record.id, {
        status: result.status,
        provider: result.provider,
        error: result.error ?? null,
      });
    }
  }

  return c.json({ result }, result.success ? 200 : 502);
});

/** 校验一个地址是否由本系统接收（前端写信时提示用） */
send.get("/resolve", async (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "缺少 address" }, 400);
  const match = await findByAddress(c.env, address);
  return c.json({ internal: Boolean(match), exact: match?.exact ?? false });
});

type ParsedSend =
  | { error: string }
  | {
      input: SendMailInput;
      attachments: IncomingAttachment[];
      providerId?: string;
      /** 本次写信暂存的附件 token，发送结束后清理 */
      stagedTokens?: string[];
    };

/**
 * 同时支持两种提交方式：
 *   multipart/form-data：payload 字段是 JSON，文件放在 attachments 字段（旧版前端）
 *   application/json：附件用 base64 内联，或引用已暂存的 token（前端写信）
 */
async function parseSendRequest(c: Context<AppContext>): Promise<ParsedSend> {
  const request = c.req.raw;
  const user = c.get("user");
  const contentType = request.headers.get("Content-Type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const rawPayload = form.get("payload");
    if (typeof rawPayload !== "string") return { error: "缺少 payload 字段" };

    let body: RawSendBody;
    try {
      body = JSON.parse(rawPayload) as RawSendBody;
    } catch {
      return { error: "payload 不是合法 JSON" };
    }

    const attachments: IncomingAttachment[] = [];
    for (const entry of form.getAll("attachments")) {
      if (typeof entry === "string") continue;
      attachments.push({
        filename: entry.name,
        contentType: entry.type || "application/octet-stream",
        content: await entry.arrayBuffer(),
      });
    }

    return buildInput(body, attachments);
  }

  let body: RawSendBody;
  try {
    body = (await request.json()) as RawSendBody;
  } catch {
    return { error: "请求体不是合法 JSON" };
  }

  const attachments: IncomingAttachment[] = [];
  const stagedTokens: string[] = [];
  for (const item of body.attachments ?? []) {
    // 先暂存后提交的附件：从 R2 staging 读取内容
    if (item.token) {
      const staged = await readStagedAttachment(c.env, user.id, item.token);
      if (!staged) return { error: `附件「${item.filename}」已过期，请重新添加` };
      attachments.push({
        filename: item.filename || staged.filename,
        contentType: item.contentType || staged.contentType,
        contentId: item.contentId,
        content: staged.content,
      });
      stagedTokens.push(item.token);
      continue;
    }

    let content: ArrayBuffer;
    try {
      content = base64ToBytes(item.content ?? "").slice().buffer as ArrayBuffer;
    } catch {
      return { error: `附件「${item.filename}」的 base64 内容不合法` };
    }
    attachments.push({
      filename: item.filename,
      contentType: item.contentType || "application/octet-stream",
      contentId: item.contentId,
      content,
    });
  }

  const built = buildInput(body, attachments);
  if ("error" in built) return built;
  return { ...built, stagedTokens };
}

interface RawSendBody {
  from?: MailAddress | string;
  to?: Array<MailAddress | string> | string;
  cc?: Array<MailAddress | string>;
  bcc?: Array<MailAddress | string>;
  replyTo?: MailAddress | string;
  subject?: string;
  html?: string;
  text?: string;
  /** 传 markdown 时由服务端转成 HTML，同时把原文作为纯文本版本 */
  markdown?: string;
  headers?: Record<string, string>;
  providerId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    /** 内联 base64 或已暂存的 token 二选一 */
    content?: string;
    token?: string;
    contentId?: string;
  }>;
}

function buildInput(body: RawSendBody, attachments: IncomingAttachment[]): ParsedSend {
  const from = normalizeAddress(body.from);
  if (!from) return { error: "缺少发件地址" };

  // Markdown 原文本身就是可读的纯文本，正好作为 text/plain 版本
  const markdown = body.markdown?.trim() ? body.markdown : undefined;
  const html = markdown ? markdownToEmailHtml(markdown) : body.html;
  const text = markdown ?? body.text;

  const input: SendMailInput = {
    from,
    to: normalizeList(body.to),
    cc: normalizeList(body.cc),
    bcc: normalizeList(body.bcc),
    replyTo: normalizeAddress(body.replyTo) ?? undefined,
    subject: body.subject?.trim() || "(无主题)",
    html,
    text,
    headers: body.headers,
  };

  // 地址会被拼进 MIME 头与 SMTP 命令，非法地址在入口挡掉，
  // 用户拿到的是 400 和具体哪个地址有问题，而不是发送阶段的 500
  const invalid = [input.from, ...input.to, ...(input.cc ?? []), ...(input.bcc ?? []), input.replyTo]
    .filter((item): item is MailAddress => Boolean(item))
    .find((item) => !isValidEmail(item.email));
  if (invalid) return { error: `地址不合法：${invalid.email.replace(/\p{C}/gu, "␡").slice(0, 80)}` };

  return { input, attachments, providerId: body.providerId };
}

/** 取所选渠道（或默认渠道）配置里的发件人名称 */
async function providerFromName(env: Env, preferredId?: string): Promise<string | undefined> {
  const chain = await getSendChain(env, preferredId);
  const config = chain[0]?.config;
  if (config && (config.type === "resend" || config.type === "sendflare")) return config.fromName;
  return undefined;
}

function normalizeAddress(value: MailAddress | string | undefined): MailAddress | null {
  if (!value) return null;
  if (typeof value === "string") {
    const email = value.trim();
    return email ? { email } : null;
  }
  return value.email ? { email: value.email.trim(), name: value.name } : null;
}

function normalizeList(value: Array<MailAddress | string> | string | undefined): MailAddress[] {
  if (!value) return [];
  const list = typeof value === "string" ? value.split(/[,;]/) : value;
  return list.map(normalizeAddress).filter((item): item is MailAddress => item !== null);
}

export default send;
