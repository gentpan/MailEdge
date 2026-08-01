import { arrayBufferToBase64 } from "../lib/crypto";
import { randomToken } from "../lib/id";
import { assertValidEmail, isValidHeaderName } from "./address";
import type { MailAddress, MailAttachment, SendMailInput } from "./types";

/**
 * 生成 RFC 5322 原始邮件。
 * Cloudflare Email Service 的 Workers 绑定收的是原始 MIME，
 * 所以抄送、密送、回复地址、自定义头、附件都在这里落到报文里。
 */
export interface BuildMimeOptions {
  /** 内部邮件 ID，会写入 Message-ID 与 X-App-Message-ID */
  internalId: string;
  date?: Date;
}

export function buildMimeMessage(input: SendMailInput, options: BuildMimeOptions): string {
  const date = options.date ?? new Date();
  const domain = input.from.email.split("@")[1] ?? "localhost";

  const headers: string[] = [
    `From: ${formatAddress(input.from)}`,
    `To: ${input.to.map(formatAddress).join(", ")}`,
  ];

  if (input.cc?.length) headers.push(`Cc: ${input.cc.map(formatAddress).join(", ")}`);
  // Bcc 不写入报文，避免暴露密送人；投递由信封收件人（Provider 层）负责。
  // 但地址仍要在这里校验一遍——它会进 SMTP 的 RCPT TO，
  // 不校验就等于给密送留了一个绕过头注入防护的口子。
  for (const address of input.bcc ?? []) assertValidEmail(address.email);
  if (input.replyTo) headers.push(`Reply-To: ${formatAddress(input.replyTo)}`);

  headers.push(`Subject: ${encodeHeaderValue(input.subject)}`);
  headers.push(`Message-ID: <${options.internalId}@${domain}>`);
  headers.push(`X-App-Message-ID: ${options.internalId}`);
  headers.push(`Date: ${formatDate(date)}`);
  headers.push("MIME-Version: 1.0");

  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (RESERVED_HEADERS.has(name.toLowerCase())) continue;
    // 字段名不经过编码就进报文，非法名（含 CRLF、冒号）一律丢弃
    if (!isValidHeaderName(name)) continue;
    headers.push(`${name}: ${encodeHeaderValue(value)}`);
  }

  const body = buildBody(input);
  return [...headers, ...body.headers, "", body.content].join("\r\n");
}

interface MimePart {
  headers: string[];
  content: string;
}

function buildBody(input: SendMailInput): MimePart {
  const attachments = input.attachments ?? [];
  const inlineAttachments = attachments.filter((item) => item.contentId);
  const fileAttachments = attachments.filter((item) => !item.contentId);

  let part = buildAlternativePart(input);

  if (inlineAttachments.length) {
    part = wrapMultipart(
      "related",
      [part, ...inlineAttachments.map(buildAttachmentPart)],
      'type="multipart/alternative"',
    );
  }
  if (fileAttachments.length) {
    part = wrapMultipart("mixed", [part, ...fileAttachments.map(buildAttachmentPart)]);
  }
  return part;
}

function buildAlternativePart(input: SendMailInput): MimePart {
  const textPart = input.text ? buildTextPart(input.text, "text/plain") : null;
  const htmlPart = input.html ? buildTextPart(input.html, "text/html") : null;

  if (textPart && htmlPart) return wrapMultipart("alternative", [textPart, htmlPart]);
  if (htmlPart) return htmlPart;
  if (textPart) return textPart;
  return buildTextPart("", "text/plain");
}

function buildTextPart(content: string, contentType: string): MimePart {
  return {
    headers: [`Content-Type: ${contentType}; charset="utf-8"`, "Content-Transfer-Encoding: base64"],
    content: wrapBase64(arrayBufferToBase64(new TextEncoder().encode(content).buffer as ArrayBuffer)),
  };
}

function buildAttachmentPart(attachment: MailAttachment): MimePart {
  // contentType 与 filename 会直接进报文，控制字符（含 CRLF/NUL）先剥离，
  // 否则会被恶意文件名/类型用来注入新头部——这是与地址同等重要的安全边界
  const contentType = stripControlChars(attachment.contentType) || "application/octet-stream";
  const filename = stripControlChars(attachment.filename) || "attachment";
  const disposition = attachment.contentId ? "inline" : "attachment";
  const headers = [
    `Content-Type: ${contentType}; name="${escapeQuoted(filename)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${disposition}; filename="${escapeQuoted(filename)}"`,
  ];
  if (attachment.contentId) headers.push(`Content-ID: <${stripControlChars(attachment.contentId)}>`);

  return { headers, content: wrapBase64(arrayBufferToBase64(attachment.content)) };
}

function stripControlChars(value: string): string {
  return value.replace(/\p{C}/gu, "");
}

function wrapMultipart(subtype: string, parts: MimePart[], extraParams = ""): MimePart {
  const boundary = `----=_MailEdge_${randomToken(12)}`;
  const suffix = extraParams ? `; ${extraParams}` : "";
  const chunks: string[] = [];

  for (const part of parts) {
    chunks.push(`--${boundary}`, ...part.headers, "", part.content);
  }
  chunks.push(`--${boundary}--`, "");

  return {
    headers: [`Content-Type: multipart/${subtype}; boundary="${boundary}"${suffix}`],
    content: chunks.join("\r\n"),
  };
}

export function formatAddress(address: MailAddress): string {
  // 地址直接进头部，不能编码（编码了收件方就投不出去），
  // 所以只能拒绝——这是防头注入的最后一道闸
  const email = assertValidEmail(address.email);
  if (!address.name) return email;
  return `${encodeHeaderValue(address.name, true)} <${email}>`;
}

/** 非 ASCII 头部按 RFC 2047 编码；纯 ASCII 的显示名只做引号包裹。 */
function encodeHeaderValue(value: string, isDisplayName = false): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) {
    return isDisplayName && /[",:;<>@\\]/.test(value) ? `"${escapeQuoted(value)}"` : value;
  }
  const encoded = arrayBufferToBase64(new TextEncoder().encode(value).buffer as ArrayBuffer);
  return `=?utf-8?B?${encoded}?=`;
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wrapBase64(value: string): string {
  return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return (
    `${DAYS[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  );
}

const RESERVED_HEADERS = new Set([
  "from",
  "to",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
]);
