import type { MailboxDO } from "./do/mailbox";

export interface Env {
  // 绑定
  DB: D1Database;
  R2: R2Bucket;
  MAILBOX: DurableObjectNamespace<MailboxDO>;
  ASSETS: Fetcher;
  /**
   * Cloudflare Email Service 发信绑定。
   * 本地开发或未开通 Workers Paid 时可能不存在，调用方需判空。
   */
  EMAIL?: SendEmail;

  // 机密（wrangler secret / .dev.vars）
  ENCRYPTION_KEY: string;
  SESSION_SECRET: string;

  // 变量
  SMART_ATTACHMENT_THRESHOLD: string;
  MAX_EMAIL_SIZE: string;
  ATTACHMENT_LINK_TTL_DAYS: string;
  APP_URL: string;
}

export function numberVar(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
