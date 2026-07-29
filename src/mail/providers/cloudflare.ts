import { EmailMessage } from "cloudflare:email";
import { classifyThrown, errorMessage } from "../errors";
import { buildMimeMessage } from "../mime";
import type { MailProvider, SendMailInput, SendMailResult } from "../types";

/**
 * Cloudflare Email Service（Workers Binding）。
 * 走原生绑定，不额外发 HTTP 请求；报文由本地 MIME 构建器生成，
 * 因此 HTML、纯文本、抄送、密送、回复地址、自定义头和附件都支持。
 *
 * 限制：整封邮件（正文 + 附件）≤ 5 MiB，最多 32 个附件；
 * 发往任意外部邮箱需要 Workers Paid。
 */
export class CloudflareMailProvider implements MailProvider {
  readonly type = "cloudflare" as const;

  constructor(
    private readonly emailBinding: SendEmail | undefined,
    private readonly internalId: string,
  ) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (!this.emailBinding) {
      return {
        provider: this.type,
        success: false,
        error: "未绑定 Cloudflare Email Service（wrangler.jsonc 的 send_email，且需要 Workers Paid）",
        failureKind: "permanent",
      };
    }

    try {
      const raw = buildMimeMessage(input, { internalId: this.internalId });

      // 绑定按信封收件人逐个投递，抄送/密送需要各自入队一次。
      const envelopeRecipients = [
        ...input.to.map((item) => item.email),
        ...(input.cc ?? []).map((item) => item.email),
        ...(input.bcc ?? []).map((item) => item.email),
      ];
      const unique = [...new Set(envelopeRecipients)];
      if (!unique.length) throw new Error("invalid recipient：收件人为空");

      for (const recipient of unique) {
        await this.emailBinding.send(new EmailMessage(input.from.email, recipient, raw));
      }

      return {
        provider: this.type,
        success: true,
        // 绑定不返回 Provider 侧 ID，用内部 ID 作为追踪凭据
        providerMessageId: this.internalId,
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
