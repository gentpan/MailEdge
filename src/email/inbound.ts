import PostalMime from "postal-mime";
import { classifyEmail } from "../ai/tasks";
import { getAiConfig, getTelegramConfig } from "../db/appSettings";
import type { MailboxRecord } from "../db/mailboxes";
import { findByAddress, mailboxStub } from "../db/mailboxes";
import type { StoreMessageInput } from "../do/mailbox";
import type { Env } from "../env";
import { newId } from "../lib/id";
import { r2Key } from "../lib/r2key";
import { sendTelegram, shouldNotify } from "../notify/telegram";
import type { MessageAddress } from "../shared/message";
import { stripHtml } from "../shared/text";

/**
 * Cloudflare Email Routing → Email Worker 的入口。
 * 解析 MIME，附件二进制落 R2，正文与元数据写进收件人对应的 Durable Object。
 */
export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const recipient = message.to.toLowerCase();
  const match = await findByAddress(env, recipient);

  if (!match) {
    // 系统里没有这个地址：拒收，让发件方拿到明确回执，而不是静默丢弃
    message.setReject(`550 5.1.1 未知收件人：${recipient}`);
    return;
  }

  const { mailbox } = match;
  // 精确登记的地址进收件箱；靠兜底兜进来的单独归到「其他地址」，避免污染主收件箱
  const folder = match.exact ? "inbox" : "catchall";

  const raw = new Response(message.raw);
  const rawBuffer = await raw.arrayBuffer();
  const parsed = await PostalMime.parse(rawBuffer);

  const messageId = newId("msg");
  // Date 头畸形时 new Date() 会得到 Invalid Date，后续 toISOString() 抛错整封退信，
  // 所以解析失败一律回退到当前时间
  const parsedDate = parsed.date ? new Date(parsed.date) : null;
  const receivedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();
  const attachments: NonNullable<StoreMessageInput["attachments"]> = [];

  // 附件并行上传 R2，互不依赖
  await Promise.all(
    (parsed.attachments ?? []).map(async (attachment, index) => {
      const content = toArrayBuffer(attachment.content);
      const filename = attachment.filename || `attachment-${index + 1}`;
      const key = r2Key.inboundAttachment(mailbox.id, messageId, index, filename, receivedAt);

      await env.R2.put(key, content, {
        httpMetadata: { contentType: attachment.mimeType || "application/octet-stream" },
      });

      attachments.push({
        id: newId("att"),
        filename,
        contentType: attachment.mimeType || "application/octet-stream",
        size: content.byteLength,
        mode: "inline",
        r2Key: key,
        token: null,
      });
    }),
  );

  const headers: Record<string, string> = {};
  for (const header of parsed.headers ?? []) {
    headers[header.key] = header.value;
  }

  const stub = mailboxStub(env, mailbox);
  await stub.store({
    id: messageId,
    internalId: headers["x-app-message-id"] ?? null,
    direction: "inbound",
    folder,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    threadId: parsed.inReplyTo ?? parsed.messageId ?? messageId,
    from: toAddress(parsed.from) ?? { email: message.from },
    to: toAddressList(parsed.to, [{ email: recipient }]),
    cc: toAddressList(parsed.cc),
    bcc: [],
    replyTo: toAddress(parsed.replyTo?.[0]) ?? null,
    subject: parsed.subject ?? "(无主题)",
    html: parsed.html ?? null,
    text: parsed.text ?? null,
    headers,
    size: rawBuffer.byteLength,
    isRead: false,
    receivedAt: receivedAt.toISOString(),
    attachments,
  });

  // 原始报文留档，便于排查投递问题与后续导出
  ctx.waitUntil(
    env.R2.put(r2Key.inboundRaw(mailbox.id, messageId, receivedAt), rawBuffer, {
      httpMetadata: { contentType: "message/rfc822" },
    })
      .then(() => undefined)
      .catch((error) => console.error("[MailEdge] 原始报文留档失败", error)),
  );

  // AI 分类与 Telegram 推送不阻塞投递，放到 waitUntil 里异步跑
  ctx.waitUntil(
    postProcess(env, {
      mailbox,
      messageId,
      from: toAddress(parsed.from)?.email ?? message.from,
      subject: parsed.subject ?? "(无主题)",
      text: parsed.text ?? stripHtml(parsed.html ?? ""),
      snippet: (parsed.text ?? stripHtml(parsed.html ?? "")).replace(/\s+/g, " ").trim().slice(0, 300),
    }).catch((error) => console.error("[MailEdge] 收信后处理失败", error)),
  );
}

/**
 * 收信后处理：先分类（若开启），再按分类决定是否推 Telegram。
 * 全程 try/catch 隔离——AI 或推送出问题绝不能影响已入库的邮件。
 */
async function postProcess(
  env: Env,
  ctx: {
    mailbox: MailboxRecord;
    messageId: string;
    from: string;
    subject: string;
    text: string;
    snippet: string;
  },
): Promise<void> {
  let category: string | null = null;

  try {
    const ai = await getAiConfig(env);
    if (ai.enabled && ai.apiKey && ai.autoClassify) {
      category = await classifyEmail(ai, { subject: ctx.subject, from: ctx.from, text: ctx.text });
      await mailboxStub(env, ctx.mailbox).setCategory(ctx.messageId, category);
    }
  } catch (error) {
    console.error("[MailEdge] 分类失败", error);
  }

  try {
    const telegram = await getTelegramConfig(env);
    if (shouldNotify(telegram, category)) {
      await sendTelegram(telegram, {
        from: ctx.from,
        subject: ctx.subject,
        snippet: ctx.snippet,
        mailbox: ctx.mailbox.address,
        category,
      });
    }
  } catch (error) {
    console.error("[MailEdge] Telegram 推送失败", error);
  }
}

function toArrayBuffer(content: string | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (typeof content === "string") return new TextEncoder().encode(content).buffer as ArrayBuffer;
  if (content instanceof Uint8Array) return content.slice().buffer as ArrayBuffer;
  return content;
}

function toAddress(
  value: { address?: string | null; name?: string | null } | undefined | null,
): MessageAddress | null {
  if (!value?.address) return null;
  return { email: value.address.toLowerCase(), name: value.name || undefined };
}

function toAddressList(
  value: Array<{ address?: string | null; name?: string | null }> | undefined | null,
  fallback: MessageAddress[] = [],
): MessageAddress[] {
  const list = (value ?? []).map(toAddress).filter((item): item is MessageAddress => item !== null);
  return list.length ? list : fallback;
}
