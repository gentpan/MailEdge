export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  }
  return date.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function displayName(address: { email: string; name?: string }): string {
  return address.name?.trim() || address.email;
}

export const STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  sending: "发送中",
  sent: "已发送",
  deferred: "等待重试",
  failed: "发送失败",
};

export const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: "Cloudflare Email Service",
  resend: "Resend",
  sendflare: "Sendflare",
};
