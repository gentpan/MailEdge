import type { Env } from "../env";
import { numberVar } from "../env";
import { randomToken } from "../lib/id";
import { r2Key } from "../lib/r2key";
import { trimTrailingSlash } from "../lib/url";
import { escapeHtml } from "../shared/text";
import { createObjectStorage, MAX_KV_VALUE_BYTES } from "../storage";
import type { MailAttachment, SendMailInput } from "./types";

export interface IncomingAttachment {
  filename: string;
  contentType: string;
  content: ArrayBuffer;
  contentId?: string;
}

export interface SharedAttachment {
  token: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
  expiresAt: string | null;
}

export interface PreparedAttachments {
  /** 真正随邮件发送的附件 */
  inline: MailAttachment[];
  /** 改为对象存储下载链接的附件 */
  shared: SharedAttachment[];
}

/**
 * 智能附件：
 *   ≤ 阈值（默认 3 MB）且整封邮件不超过 Provider 上限 → 真 Email Attachment
 *   否则 → 上传对象存储，正文插入带 token 的下载链接
 * 用户不需要关心底层用了哪种方式。
 */
export async function prepareAttachments(
  env: Env,
  params: {
    messageId: string;
    userId: string | null;
    mailboxId: string;
    attachments: IncomingAttachment[];
    bodySize: number;
  },
): Promise<PreparedAttachments> {
  const threshold = numberVar(env.SMART_ATTACHMENT_THRESHOLD, 3 * 1024 * 1024);
  const maxEmailSize = numberVar(env.MAX_EMAIL_SIZE, 4.5 * 1024 * 1024);
  const ttlDays = numberVar(env.ATTACHMENT_LINK_TTL_DAYS, 7);

  const inline: MailAttachment[] = [];
  const shared: SharedAttachment[] = [];

  // base64 会放大约 4/3；预留正文与头部占用
  let budget = maxEmailSize - params.bodySize - 4096;
  const sorted = [...params.attachments].sort((a, b) => a.content.byteLength - b.content.byteLength);

  for (const attachment of sorted) {
    const encodedSize = Math.ceil((attachment.content.byteLength * 4) / 3);
    const fitsInline =
      attachment.content.byteLength <= threshold && encodedSize <= budget && inline.length < 32;

    // 内嵌图片（cid:）必须留在邮件里，否则正文会裂图
    if (fitsInline || attachment.contentId) {
      inline.push({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
        contentId: attachment.contentId,
      });
      budget -= encodedSize;
      continue;
    }

    shared.push(await shareViaStorage(env, { ...params, attachment, ttlDays }));
  }

  return { inline, shared };
}

async function shareViaStorage(
  env: Env,
  params: {
    messageId: string;
    userId: string | null;
    mailboxId: string;
    attachment: IncomingAttachment;
    ttlDays: number;
  },
): Promise<SharedAttachment> {
  const { attachment } = params;
  const objectStorage = await createObjectStorage(env);
  if (objectStorage.backend === "kv" && attachment.content.byteLength > MAX_KV_VALUE_BYTES) {
    throw new Error("当前使用 KV 存储，单个分享附件不能超过 25MB");
  }
  const token = randomToken(24);
  const key = r2Key.share(params.mailboxId, token, attachment.filename);

  await objectStorage.put(key, attachment.content, {
    httpMetadata: {
      contentType: attachment.contentType,
      contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    },
  });

  const expiresAt =
    params.ttlDays > 0 ? new Date(Date.now() + params.ttlDays * 86_400_000).toISOString() : null;

  await env.DB.prepare(
    `INSERT INTO attachment_links (token, r2_key, filename, content_type, size, message_id, user_id, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      token,
      key,
      attachment.filename,
      attachment.contentType,
      attachment.content.byteLength,
      params.messageId,
      params.userId,
      expiresAt,
    )
    .run();

  return {
    token,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.content.byteLength,
    url: `${trimTrailingSlash(env.APP_URL)}/d/${token}`,
    expiresAt,
  };
}

/** 把大附件的下载区块追加进正文 */
export function appendShareSection(input: SendMailInput, shared: SharedAttachment[]): SendMailInput {
  if (!shared.length) return input;

  const rows = shared
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">` +
        `<a href="${escapeHtml(item.url)}" style="color:#111827;text-decoration:none;font-weight:600;">📎 ${escapeHtml(item.filename)}</a>` +
        `<span style="color:#6b7280;font-size:12px;margin-left:8px;">${formatSize(item.size)}</span>` +
        `</td></tr>`,
    )
    .join("");

  const expiryNote = shared[0]?.expiresAt
    ? `<p style="color:#9ca3af;font-size:12px;margin:12px 0 0;">下载链接将于 ${new Date(shared[0].expiresAt).toLocaleDateString("zh-CN")} 过期</p>`
    : "";

  const htmlBlock =
    `<div style="margin-top:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">` +
    `<p style="margin:0 0 8px;color:#6b7280;font-size:12px;">附件（点击下载）</p>` +
    `<table style="width:100%;border-collapse:collapse;">${rows}</table>${expiryNote}</div>`;

  const textBlock =
    "\n\n附件（点击下载）：\n" +
    shared.map((item) => `- ${item.filename}（${formatSize(item.size)}）\n  ${item.url}`).join("\n");

  return {
    ...input,
    html: input.html ? `${input.html}${htmlBlock}` : undefined,
    text: input.text ? `${input.text}${textBlock}` : input.html ? undefined : textBlock.trim(),
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
