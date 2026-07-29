/** AI 与通知相关的共享类型 */

/**
 * OpenAI 兼容的 AI 配置。baseUrl + apiKey + model 可指向 OpenAI、
 * 转发站或本地模型（如 Ollama 的 /v1）。加密后存 D1 settings。
 */
export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 收信时自动分类 */
  autoClassify: boolean;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  /** 只推送这些分类的新信；空表示全部推送 */
  onlyCategories: MailCategory[];
}

export const AI_DEFAULTS: AiConfig = {
  enabled: false,
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  autoClassify: false,
};

export const TELEGRAM_DEFAULTS: TelegramConfig = {
  enabled: false,
  botToken: "",
  chatId: "",
  onlyCategories: [],
};

/** 邮件分类。对齐常见收件箱的分栏习惯，固定一小组，便于前端分栏与过滤。 */
export type MailCategory = "important" | "updates" | "promotions" | "social" | "other";

export const MAIL_CATEGORIES: MailCategory[] = ["important", "updates", "promotions", "social", "other"];

export const CATEGORY_LABELS: Record<MailCategory, string> = {
  important: "重要",
  updates: "更新",
  promotions: "营销",
  social: "社交",
  other: "其他",
};

export function isMailCategory(value: string): value is MailCategory {
  return (MAIL_CATEGORIES as string[]).includes(value);
}
