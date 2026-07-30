export type MailProviderType = "cloudflare" | "resend" | "sendflare" | "smtp";

export interface MailAddress {
  email: string;
  name?: string;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: ArrayBuffer;
  /** 内嵌图片的 Content-ID，正文中以 cid:xxx 引用 */
  contentId?: string;
}

export interface SendMailInput {
  from: MailAddress;
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  replyTo?: MailAddress;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
}

export interface SendMailResult {
  provider: MailProviderType;
  providerMessageId?: string;
  success: boolean;
  error?: string;
  /** 失败时的错误分类，决定是否切换备用渠道 */
  failureKind?: FailureKind;
}

export interface MailProvider {
  readonly type: MailProviderType;
  send(input: SendMailInput): Promise<SendMailResult>;
}

/**
 * 错误分类。只有 transient 允许重试或切换备用 Provider；
 * permanent 一律直接失败，否则一封被拒的邮件会在三个平台各发一次。
 */
export type FailureKind = "transient" | "permanent";

/** Provider 配置（解密后的形态） */
export type MailProviderConfig =
  | { type: "cloudflare"; defaultDomain?: string }
  | { type: "resend"; apiKey: string; verifiedDomains?: string[]; fromName?: string }
  | { type: "sendflare"; token: string; secret?: string; baseUrl?: string; verifiedDomains?: string[]; fromName?: string }
  | {
      type: "smtp";
      host: string;
      port: number;
      username: string;
      password: string;
      /** 465 用 tls（连接即加密）；587 用 starttls（明文握手后升级） */
      security: "tls" | "starttls";
    };

export interface MailProviderRecord {
  id: string;
  name: string;
  type: MailProviderType;
  config: MailProviderConfig;
  isDefault: boolean;
  isEnabled: boolean;
  priority: number;
  lastError?: string | null;
  lastCheckedAt?: string | null;
  createdAt: string;
}

/** 发送状态机 */
export type OutboundStatus = "queued" | "sending" | "sent" | "deferred" | "failed";

export interface SendAttempt {
  providerId: string;
  providerType: MailProviderType;
  at: string;
  success: boolean;
  error?: string;
  failureKind?: FailureKind;
}
