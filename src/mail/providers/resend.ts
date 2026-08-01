import { arrayBufferToBase64 } from "../../lib/crypto";
import { safeJson } from "../../lib/http";
import { classifyHttpFailure, classifyThrown, errorMessage } from "../errors";
import { formatAddress } from "../mime";
import type { MailProvider, SendMailInput, SendMailResult } from "../types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export class ResendMailProvider implements MailProvider {
  readonly type = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly internalId: string,
  ) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: formatAddress(input.from),
          to: input.to.map(formatAddress),
          cc: input.cc?.map(formatAddress),
          bcc: input.bcc?.map(formatAddress),
          reply_to: input.replyTo ? formatAddress(input.replyTo) : undefined,
          subject: input.subject,
          html: input.html,
          text: input.text,
          headers: { ...input.headers, "X-App-Message-ID": this.internalId },
          attachments: input.attachments?.map((item) => ({
            filename: item.filename,
            content: arrayBufferToBase64(item.content),
            content_type: item.contentType,
            content_id: item.contentId,
          })),
        }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        const message = extractMessage(data) ?? `Resend 请求失败（HTTP ${response.status}）`;
        return {
          provider: this.type,
          success: false,
          error: message,
          failureKind: classifyHttpFailure(response.status, message),
        };
      }

      return {
        provider: this.type,
        success: true,
        providerMessageId: typeof data?.id === "string" ? data.id : undefined,
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

function extractMessage(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  if (typeof data.message === "string") return data.message;
  const error = data.error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  if (typeof data.name === "string") return data.name;
  return undefined;
}
