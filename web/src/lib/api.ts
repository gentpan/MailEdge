import type { FolderStats, MailFolder, MessageDetail, MessageSummary } from "../../../src/shared/message";
import type { MailProviderType } from "../../../src/mail/types";

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
  attemptLog: Array<{ providerType: string; at: string; success: boolean; error?: string }>;
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

  // 信箱与邮件
  mailboxes: () => request<{ mailboxes: Mailbox[] }>("/api/mailboxes"),
  createMailbox: (body: { address: string; displayName?: string; isCatchAll?: boolean }) =>
    request<{ mailbox: Mailbox }>("/api/mailboxes", { method: "POST", body: JSON.stringify(body) }),
  deleteMailbox: (id: string) => request<{ ok: true }>(`/api/mailboxes/${id}`, { method: "DELETE" }),

  stats: (mailboxId?: string) =>
    request<{ stats: FolderStats[] }>(`/api/stats${mailboxId ? `?mailboxId=${mailboxId}` : ""}`),

  messages: (params: { mailboxId?: string; folder: MailFolder; q?: string; before?: string }) => {
    const search = new URLSearchParams({ folder: params.folder });
    if (params.mailboxId) search.set("mailboxId", params.mailboxId);
    if (params.q) search.set("q", params.q);
    if (params.before) search.set("before", params.before);
    return request<{ items: MessageSummary[]; nextCursor: string | null }>(`/api/messages?${search}`);
  },

  message: (id: string, mailboxId?: string) =>
    request<{ message: MessageDetail }>(
      `/api/messages/${id}${mailboxId ? `?mailboxId=${mailboxId}` : ""}`,
    ),

  patchMessage: (id: string, body: { isRead?: boolean; isStarred?: boolean; folder?: MailFolder }, mailboxId?: string) =>
    request<{ ok: true }>(`/api/messages/${id}${mailboxId ? `?mailboxId=${mailboxId}` : ""}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteMessage: (id: string, mailboxId?: string) =>
    request<{ ok: true }>(`/api/messages/${id}${mailboxId ? `?mailboxId=${mailboxId}` : ""}`, {
      method: "DELETE",
    }),

  // 发信
  send: (payload: Record<string, unknown>, files: File[]) => {
    if (!files.length) {
      return request<SendResponse>("/api/mail/send", { method: "POST", body: JSON.stringify(payload) });
    }
    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    for (const file of files) form.append("attachments", file);
    return request<SendResponse>("/api/mail/send", { method: "POST", body: form });
  },

  outbox: () => request<{ messages: OutboundView[] }>("/api/mail/outbox"),
  retry: (id: string) => request<{ result: SendResponse }>(`/api/mail/outbox/${id}/retry`, { method: "POST" }),

  // 渠道
  providers: () => request<{ providers: ProviderView[] }>("/api/providers"),
  saveProvider: (body: Record<string, unknown>) =>
    request<{ provider: ProviderView }>("/api/providers", { method: "POST", body: JSON.stringify(body) }),
  setDefaultProvider: (id: string) => request<{ ok: true }>(`/api/providers/${id}/default`, { method: "POST" }),
  deleteProvider: (id: string) => request<{ ok: true }>(`/api/providers/${id}`, { method: "DELETE" }),
  testProvider: (id: string, body: { from: string; to: string }) =>
    request<{ result: { success: boolean; error?: string; providerMessageId?: string } }>(
      `/api/providers/${id}/test`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  // 分享链接
  shares: () =>
    request<{
      shares: Array<{
        token: string;
        filename: string;
        size: number;
        downloads: number;
        is_revoked: number;
        expires_at: string | null;
        created_at: string;
      }>;
    }>("/api/shares"),
  revokeShare: (token: string) => request<{ ok: true }>(`/api/shares/${token}/revoke`, { method: "POST" }),
};
