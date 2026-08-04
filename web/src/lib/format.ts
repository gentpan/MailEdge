export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(value: string, locale = "zh-CN"): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const isChinese = locale.toLowerCase().startsWith("zh");

  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return isChinese
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  return isChinese
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
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

// 状态文案已改由 i18n 的 status.* 提供；Provider 是品牌名，无需翻译
export const PROVIDER_LABELS: Record<string, string> = {
  cloudflare: "Cloudflare Email Service",
  resend: "Resend",
  sendflare: "Sendflare",
  smtp: "SMTP",
};
