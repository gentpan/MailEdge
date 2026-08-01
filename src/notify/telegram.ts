import type { TelegramConfig } from "../ai/types";
import { CATEGORY_LABELS, isMailCategory } from "../ai/types";
import { escapeHtml } from "../shared/text";

export interface InboundNotice {
  from: string;
  subject: string;
  snippet: string;
  mailbox: string;
  category: string | null;
}

/** 是否应就这封信推送（受启用开关与分类白名单约束） */
export function shouldNotify(config: TelegramConfig, category: string | null): boolean {
  if (!config.enabled || !config.botToken || !config.chatId) return false;
  if (!config.onlyCategories.length) return true;
  return category ? config.onlyCategories.includes(category as never) : false;
}

export async function sendTelegram(config: TelegramConfig, notice: InboundNotice): Promise<boolean> {
  const label = notice.category && isMailCategory(notice.category) ? CATEGORY_LABELS[notice.category] : null;
  const lines = [
    `📬 <b>${escapeHtml(notice.subject || "(无主题)")}</b>`,
    `发件人：${escapeHtml(notice.from)}`,
    `信箱：${escapeHtml(notice.mailbox)}${label ? `　·　${label}` : ""}`,
    "",
    escapeHtml(notice.snippet.slice(0, 300)),
  ];

  const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  return response.ok;
}

/** 测试推送，用于设置页验证配置 */
export async function sendTelegramTest(config: TelegramConfig): Promise<{ ok: boolean; error?: string }> {
  if (!config.botToken || !config.chatId) return { ok: false, error: "请填写 Bot Token 与 Chat ID" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: "✅ MailEdge Telegram 推送已连通" }),
    });
    if (response.ok) return { ok: true };
    const data = (await response.json().catch(() => null)) as { description?: string } | null;
    return { ok: false, error: data?.description ?? `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "请求失败" };
  }
}
