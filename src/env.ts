import type { MailboxDO } from "./do/mailbox";

export interface Env {
  // 绑定
  DB: D1Database;
  /** 可选对象存储：部署到未开通 R2 的账户时可以只绑定 KV。 */
  R2?: R2Bucket;
  KV?: KVNamespace;
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
  /** 安装向导（deployer）地址，用于版本检查与升级跳转 */
  DEPLOYER_URL: string;
}

export function numberVar(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
