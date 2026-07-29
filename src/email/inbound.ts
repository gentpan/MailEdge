import PostalMime from "postal-mime";
import { findByAddress, mailboxStub } from "../db/mailboxes";
import type { StoreMessageInput } from "../do/mailbox";
import type { Env } from "../env";
import { newId } from "../lib/id";
import type { MessageAddress } from "../shared/message";

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
  const attachments: NonNullable<StoreMessageInput["attachments"]> = [];

  for (const [index, attachment] of (parsed.attachments ?? []).entries()) {
    const content = toArrayBuffer(attachment.content);
    const filename = attachment.filename || `attachment-${index + 1}`;
    const key = `inbound/${mailbox.id}/${messageId}/${index}-${filename.replace(/[^\w.\-]/g, "_").slice(0, 100)}`;

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
  }

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
    receivedAt: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
    attachments,
  });

  // 原始报文留档，便于排查投递问题与后续导出
  ctx.waitUntil(
    env.R2.put(`inbound/${mailbox.id}/${messageId}/raw.eml`, rawBuffer, {
      httpMetadata: { contentType: "message/rfc822" },
    }).then(() => undefined),
  );
}

function toArrayBuffer(content: string | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (typeof content === "string") return new TextEncoder().encode(content).buffer as ArrayBuffer;
  if (content instanceof Uint8Array) return content.slice().buffer as ArrayBuffer;
  return content;
}

function toAddress(value: { address?: string | null; name?: string | null } | undefined | null): MessageAddress | null {
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
