import type { Env } from "../env";
import { CloudflareMailProvider } from "./providers/cloudflare";
import { ResendMailProvider } from "./providers/resend";
import { SendflareMailProvider } from "./providers/sendflare";
import { SmtpMailProvider } from "./providers/smtp";
import type { MailProvider, MailProviderConfig } from "./types";

/**
 * 新增服务商（SES、Mailgun、Postmark、SMTP…）只需要加一个分支和一个 Provider 类。
 */
export function createMailProvider(env: Env, config: MailProviderConfig, internalId: string): MailProvider {
  switch (config.type) {
    case "cloudflare":
      return new CloudflareMailProvider(env.EMAIL, internalId);
    case "resend":
      return new ResendMailProvider(config.apiKey, internalId);
    case "sendflare":
      return new SendflareMailProvider(config.token, internalId, config.secret, config.baseUrl);
    case "smtp":
      return new SmtpMailProvider(
        {
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          security: config.security,
        },
        internalId,
      );
    default: {
      const exhaustive: never = config;
      throw new Error(`不支持的邮件服务：${(exhaustive as { type: string }).type}`);
    }
  }
}
