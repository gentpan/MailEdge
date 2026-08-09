import type { AuthenticationJSON, CredentialDescriptor, RegistrationJSON } from "@passwordless-id/webauthn";
import type { MailProviderType } from "../../../src/mail/types";
import type {
  CustomFolder,
  FolderStats,
  MailFolder,
  MessageDetail,
  MessageSummary,
} from "../../../src/shared/message";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  isEnabled: boolean;
  createdAt: string;
}

export interface Mailbox {
  id: string;
  address: string;
  displayName: string | null;
  isCatchAll: boolean;
  domain: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string;
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderView {
  id: string;
  name: string;
  type: MailProviderType;
  isDefault: boolean;
  isEnabled: boolean;
  priority: number;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  config: Record<string, unknown>;
}

export interface OutboundView {
  id: string;
  fromEmail: string;
  to: Array<{ email: string; name?: string }>;
  subject: string;
  status: "queued" | "sending" | "sent" | "deferred" | "failed";
  providerType: string | null;
  providerMessageId: string | null;
  attempts: number;
  attemptLog: Array<{
    providerId: string;
    providerType: string;
    at: string;
    success: boolean;
    error?: string;
    failureKind?: "transient" | "permanent";
  }>;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

export interface SendResponse {
  internalId: string;
  status: "sent" | "deferred" | "failed";
  provider: string;
  success: boolean;
  error?: string;
  smartAttachments: {
    inline: Array<{ filename: string; size: number }>;
    shared: Array<{ filename: string; size: number; url: string }>;
  };
}

export interface AiConfigView {
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
  hasKey?: boolean;
  model?: string;
}

export interface TelegramView {
  enabled: boolean;
  botToken?: string;
  hasToken?: boolean;
  chatId?: string;
  onlyCategories?: string[];
}

export interface AiConfigResponse {
  ai: AiConfigView;
  telegram: TelegramView;
  categories: Record<string, string>;
}

export interface UpdateVersionView {
  currentVersion: string;
  availableVersion: string | null;
  updateAvailable: boolean;
  source: "deployer" | null;
  checkedAt: string;
}

export type StorageBackend = "r2" | "kv";

export interface StorageConfigView {
  backend: StorageBackend;
  configuredBackend: StorageBackend;
  r2Available: boolean;
  kvAvailable: boolean;
  outboundRetentionDays: 90 | 180 | 365;
  outboundRetentionOptions: readonly [90, 180, 365];
}

export interface UsageView {
  scope: "instance" | "account";
  d1: {
    sizeBytes: number | null;
    pageCount: number | null;
    pageSize: number | null;
    totalRows: number;
    rows: Record<string, number>;
  };
  durableObjects: {
    mailboxCount: number;
    messageCount: number;
    attachmentCount: number;
    archivedMessageCount: number;
    sqliteBytes: number | null;
    bodyBytesInSqlite: number;
  };
  r2: { available: boolean; objectCount: number; bytes: number; truncated: boolean };
  updatedAt: string;
}

export interface ManagedAttachmentView {
  id: string;
  source: "message" | "share";
  mailboxId: string | null;
  mailboxAddress: string | null;
  messageId: string | null;
  messageSubject: string | null;
  filename: string;
  contentType: string;
  size: number;
  direction: "inbound" | "outbound";
  folder: MailFolder;
  mode: "inline" | "link";
  uploadedAt: string;
  downloadUrl: string;
  token: string | null;
  downloads?: number;
  expiresAt?: string | null;
  expired?: boolean;
  revoked?: boolean;
}

export type ManagedAttachmentRef =
  | { source: "message"; mailboxId: string; messageId: string; attachmentId: string }
  | { source: "share"; token: string };

export interface StagedAttachment {
  token: string;
  filename: string;
  contentType: string;
  size: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const isJson = response.headers.get("Content-Type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = (payload as { error?: string } | null)?.error ?? `请求失败（HTTP ${response.status}）`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export const api = {
  // 认证
  needsSetup: () => request<{ needsSetup: boolean }>("/api/auth/setup"),
  setup: (body: { email: string; password: string; name?: string; mailbox?: string }) =>
    request<{ user: User }>("/api/auth/setup", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: User; mailboxes: Mailbox[] }>("/api/auth/me"),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: true }>("/api/auth/password", { method: "POST", body: JSON.stringify(body) }),
  passkeyRegisterOptions: () =>
    request<{
      challenge: string;
      domain: string;
      user: { id: string; name: string; displayName: string };
      credentials: CredentialDescriptor[];
    }>("/api/auth/passkey/register/options", { method: "POST" }),
  passkeyRegisterVerify: (body: { challenge: string; registration: RegistrationJSON }) =>
    request<{ ok: true }>("/api/auth/passkey/register/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  passkeyLoginOptions: (body: { email: string }) =>
    request<{
      challenge: string;
      domain: string;
      allowCredentials: CredentialDescriptor[];
    }>("/api/auth/passkey/login/options", { method: "POST", body: JSON.stringify(body) }),
  passkeyLoginVerify: (body: { challenge: string; authentication: AuthenticationJSON }) =>
    request<{ user: User }>("/api/auth/passkey/login/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requestPasswordReset: (body: { email: string }) =>
    request<{ ok: true }>("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmPasswordReset: (body: { token: string; newPassword: string }) =>
    request<{ ok: true }>("/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // 信箱与邮件
  mailboxes: () => request<{ mailboxes: Mailbox[] }>("/api/mailboxes"),
  createMailbox: (body: { address: string; displayName?: string; isCatchAll?: boolean }) =>
    request<{ mailbox: Mailbox }>("/api/mailboxes", { method: "POST", body: JSON.stringify(body) }),
  updateMailbox: (id: string, body: { displayName?: string | null; isCatchAll?: boolean }) =>
    request<{ mailbox: Mailbox }>(`/api/mailboxes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMailbox: (id: string, options: { confirmCatchAll?: boolean } = {}) =>
    request<{ ok: true }>(`/api/mailboxes/${id}${options.confirmCatchAll ? "?confirmCatchAll=true" : ""}`, {
      method: "DELETE",
    }),

  folders: () => request<{ folders: CustomFolder[] }>("/api/folders"),
  createFolder: (body: { name: string }) =>
    request<{ folder: CustomFolder }>("/api/folders", { method: "POST", body: JSON.stringify(body) }),
  updateFolder: (id: string, body: { name: string }) =>
    request<{ folder: CustomFolder }>(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFolder: (id: string) => request<{ ok: true }>(`/api/folders/${id}`, { method: "DELETE" }),

  contacts: () => request<{ contacts: Contact[] }>("/api/contacts"),
  createContact: (body: { email: string; name: string; company?: string; notes?: string }) =>
    request<{ contact: Contact }>("/api/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateContact: (id: string, body: { email: string; name: string; company?: string; notes?: string }) =>
    request<{ contact: Contact }>(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteContact: (id: string) => request<{ ok: true }>(`/api/contacts/${id}`, { method: "DELETE" }),

  stats: (mailboxId?: string) =>
    request<{ stats: FolderStats[] }>(`/api/stats${mailboxId ? `?mailboxId=${mailboxId}` : ""}`),

  messages: (params: {
    mailboxId?: string;
    folder: MailFolder;
    category?: string;
    q?: string;
    before?: string;
    limit?: number;
  }) => {
    const search = new URLSearchParams({ folder: params.folder });
    if (params.mailboxId) search.set("mailboxId", params.mailboxId);
    if (params.category) search.set("category", params.category);
    if (params.q) search.set("q", params.q);
    if (params.before) search.set("before", params.before);
    if (params.limit) search.set("limit", String(params.limit));
    return request<{ items: MessageSummary[]; nextCursor: string | null }>(`/api/messages?${search}`);
  },

  message: (id: string, mailboxId?: string) =>
    request<{ message: MessageDetail }>(`/api/messages/${id}${mailboxId ? `?mailboxId=${mailboxId}` : ""}`),

  patchMessage: (
    id: string,
    body: { isRead?: boolean; isStarred?: boolean; folder?: MailFolder },
    mailboxId?: string,
  ) =>
    request<{ ok: true }>(`/api/messages/${id}${mailboxId ? `?mailboxId=${mailboxId}` : ""}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  markAllRead: (folder: MailFolder, mailboxId?: string) =>
    request<{ ok: true }>(`/api/messages/read-all${mailboxId ? `?mailboxId=${mailboxId}` : ""}`, {
      method: "POST",
      body: JSON.stringify({ folder }),
    }),

  deleteMessage: (id: string, mailboxId?: string) =>
    request<{ ok: true }>(`/api/messages/${id}${mailboxId ? `?mailboxId=${mailboxId}` : ""}`, {
      method: "DELETE",
    }),

  // 发信
  send: (payload: Record<string, unknown>, attachments: Array<{ token: string; filename: string }>) =>
    request<SendResponse>("/api/mail/send", {
      method: "POST",
      body: JSON.stringify({ ...payload, attachments }),
    }),

  /** 上传附件到暂存区（XHR 带上传进度），返回 token 供提交/删除 */
  uploadAttachment: (file: File, onProgress: (percent: number) => void) =>
    new Promise<{ token: string; filename: string; size: number }>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/mail/attachment");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText) as {
            token: string;
            filename: string;
            size: number;
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error ?? "上传失败"));
        } catch {
          reject(new Error("上传失败"));
        }
      };
      xhr.onerror = () => reject(new Error("上传失败"));
      xhr.send(form);
    }),

  deleteAttachment: (token: string) =>
    request<{ ok: true }>(`/api/mail/attachment/${token}`, { method: "DELETE" }),

  // 对象存储附件管理（R2 或 KV）
  attachments: () => request<{ attachments: ManagedAttachmentView[]; total: number }>("/api/attachments"),
  stageAttachment: (ref: ManagedAttachmentRef) =>
    request<StagedAttachment>("/api/attachments/stage", {
      method: "POST",
      body: JSON.stringify(ref),
    }),
  deleteManagedAttachment: (ref: ManagedAttachmentRef) =>
    request<{ ok: true }>("/api/attachments", {
      method: "DELETE",
      body: JSON.stringify(ref),
    }),

  outbox: () => request<{ messages: OutboundView[] }>("/api/mail/outbox"),
  retry: (id: string) =>
    request<{ result: SendResponse }>(`/api/mail/outbox/${id}/retry`, { method: "POST" }),

  // 渠道
  providers: () => request<{ providers: ProviderView[] }>("/api/providers"),
  saveProvider: (body: Record<string, unknown>) =>
    request<{ provider: ProviderView }>("/api/providers", { method: "POST", body: JSON.stringify(body) }),
  setDefaultProvider: (id: string) =>
    request<{ ok: true }>(`/api/providers/${id}/default`, { method: "POST" }),
  fetchProviderDomains: (id: string) =>
    request<{ domains: string[]; provider: ProviderView }>(`/api/providers/${id}/domains`, {
      method: "POST",
    }),
  cloudflareStatus: () => request<{ available: boolean }>("/api/providers/cloudflare/status"),
  deleteProvider: (id: string) => request<{ ok: true }>(`/api/providers/${id}`, { method: "DELETE" }),
  testProvider: (id: string, body: { from: string; to: string }) =>
    request<{ result: { success: boolean; error?: string; providerMessageId?: string } }>(
      `/api/providers/${id}/test`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  // AI 与通知
  aiConfig: () => request<AiConfigResponse>("/api/ai/config"),
  saveAiConfig: (body: Record<string, unknown>) =>
    request<{ ai: AiConfigView }>("/api/ai/config", { method: "POST", body: JSON.stringify(body) }),
  testAiConfig: () =>
    request<{ ok: boolean; reply?: string; error?: string }>("/api/ai/config/test", { method: "POST" }),
  saveTelegram: (body: Record<string, unknown>) =>
    request<{ telegram: TelegramView }>("/api/ai/telegram", { method: "POST", body: JSON.stringify(body) }),
  testTelegram: () => request<{ ok: boolean; error?: string }>("/api/ai/telegram/test", { method: "POST" }),

  // 附件与发送载荷的对象存储
  storageConfig: () => request<StorageConfigView>("/api/storage/config"),
  saveStorageConfig: (backend: StorageBackend) =>
    request<StorageConfigView>("/api/storage/config", {
      method: "POST",
      body: JSON.stringify({ backend }),
    }),
  saveOutboundRetention: (days: 90 | 180 | 365) =>
    request<{ outboundRetentionDays: 90 | 180 | 365; outboundRetentionOptions: readonly [90, 180, 365] }>(
      "/api/storage/retention",
      { method: "POST", body: JSON.stringify({ days }) },
    ),
  usage: () => request<UsageView>("/api/usage"),

  // 版本检查；实际升级在 mailedge.sh 的部署向导完成
  updateVersion: () => request<UpdateVersionView>("/api/update/version"),

  aiReply: (id: string, mailboxId: string, body: { instruction?: string; tone?: string }) =>
    request<{ draft: string }>(`/api/ai/messages/${id}/reply?mailboxId=${mailboxId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  aiSummarize: (id: string, mailboxId: string, force?: boolean) =>
    request<{ summary: string; cached: boolean }>(
      `/api/ai/messages/${id}/summarize?mailboxId=${mailboxId}${force ? "&force=1" : ""}`,
      { method: "POST" },
    ),
  aiClassify: (id: string, mailboxId: string) =>
    request<{ category: string; label: string }>(`/api/ai/messages/${id}/classify?mailboxId=${mailboxId}`, {
      method: "POST",
    }),

  // 分享链接
  shares: () =>
    request<{
      shares: Array<{
        token: string;
        filename: string;
        content_type: string;
        size: number;
        downloads: number;
        is_revoked: number;
        message_id: string | null;
        expires_at: string | null;
        created_at: string;
      }>;
    }>("/api/shares"),
  revokeShare: (token: string) => request<{ ok: true }>(`/api/shares/${token}/revoke`, { method: "POST" }),
};
