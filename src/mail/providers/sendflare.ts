import { arrayBufferToBase64, base64ToBytes } from "../../lib/crypto";
import { classifyHttpFailure, classifyThrown, errorMessage } from "../errors";
import type { MailProvider, SendMailInput, SendMailResult } from "../types";

const DEFAULT_BASE_URL = "https://api.sendflare.com";

/**
 * Sendflare。直接调 REST API，不为了一个请求引入完整 SDK。
 * 认证：Bearer Token；若配置了 secret，额外附带 HMAC-SHA256 签名头。
 *
 * 注意：字段名与签名头以 Sendflare 当前 API Reference 为准，
 * 若官方有调整，只需要改本文件，不影响上层抽象。
 */
export class SendflareMailProvider implements MailProvider {
  readonly type = "sendflare" as const;

  constructor(
    private readonly token: string,
    private readonly internalId: string,
    private readonly secret?: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    try {
      const body = JSON.stringify({
        from: input.from,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        reply_to: input.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: { ...input.headers, "X-App-Message-ID": this.internalId },
        attachments: input.attachments?.map((item) => ({
          filename: item.filename,
          content_type: item.contentType,
          content: arrayBufferToBase64(item.content),
          content_id: item.contentId,
        })),
      });

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      };

      if (this.secret) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        headers["X-Sendflare-Timestamp"] = timestamp;
        headers["X-Sendflare-Signature"] = await hmacSha256Hex(this.secret, `${timestamp}.${body}`);
      }

      const response = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/emails`, {
        method: "POST",
        headers,
        body,
      });

      const data = await safeJson(response);

      if (!response.ok) {
        const message =
          (typeof data?.message === "string" ? data.message : undefined) ??
          (typeof data?.error === "string" ? data.error : undefined) ??
          `Sendflare 请求失败（HTTP ${response.status}）`;
        return {
          provider: this.type,
          success: false,
          error: message,
          failureKind: classifyHttpFailure(response.status, message),
        };
      }

      const id = data?.id ?? (data?.data as { id?: unknown } | undefined)?.id;
      return {
        provider: this.type,
        success: true,
        providerMessageId: typeof id === "string" ? id : undefined,
      };
    } catch (error) {
      return {
        provider: this.type,
        success: false,
        error: errorMessage(error),
        failureKind: classifyThrown(error),
      };
    }
  }
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const keyBytes = /^[A-Za-z0-9+/=_-]+$/.test(secret) && secret.length % 4 === 0
    ? base64ToBytes(secret)
    : new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
