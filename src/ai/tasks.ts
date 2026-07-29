import { chat } from "./client";
import type { AiConfig } from "./types";
import { CATEGORY_LABELS, MAIL_CATEGORIES, isMailCategory } from "./types";
import type { MailCategory } from "./types";

/** 把正文压到合理长度，避免超长邮件撑爆上下文与费用 */
function clip(text: string, max = 6000): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  return clean.length > max ? `${clean.slice(0, max)}\n……（内容过长已截断）` : clean;
}

export interface EmailContext {
  subject: string;
  from: string;
  text: string;
}

/** 分类：只返回固定集合里的一个标签，解析失败兜底 other */
export async function classifyEmail(config: AiConfig, email: EmailContext): Promise<MailCategory> {
  const labels = MAIL_CATEGORIES.map((c) => `${c}（${CATEGORY_LABELS[c]}）`).join("、");
  const content = await chat(
    config,
    [
      {
        role: "system",
        content:
          "你是邮件分类助手。把邮件归入且仅归入以下之一：" +
          labels +
          "。important=需要本人处理或含重要通知；updates=系统/服务通知、账单、状态更新；" +
          "promotions=营销推广；social=社交、社区互动；其余归 other。" +
          '只输出 JSON：{"category":"<英文键>"}。',
      },
      {
        role: "user",
        content: `发件人：${email.from}\n主题：${email.subject}\n正文：\n${clip(email.text, 2000)}`,
      },
    ],
    { temperature: 0, maxTokens: 40, json: true },
  );

  try {
    const parsed = JSON.parse(content) as { category?: string };
    if (parsed.category && isMailCategory(parsed.category)) return parsed.category;
  } catch {
    // 落到下面的兜底
  }
  const match = MAIL_CATEGORIES.find((c) => content.includes(c));
  return match ?? "other";
}

/** 总结：输出简明中文要点 */
export async function summarizeEmail(config: AiConfig, email: EmailContext): Promise<string> {
  return chat(
    config,
    [
      {
        role: "system",
        content: "你是邮件助手。用简体中文给出邮件要点，3-5 条短句，聚焦对方诉求与需要的行动，不要寒暄。",
      },
      { role: "user", content: `主题：${email.subject}\n发件人：${email.from}\n正文：\n${clip(email.text)}` },
    ],
    { temperature: 0.3, maxTokens: 400 },
  );
}

export interface ReplyOptions {
  /** 用户给的额外指示，如「婉拒」「答应并约周四」 */
  instruction?: string;
  tone?: "formal" | "friendly" | "concise";
}

const TONE_HINT: Record<NonNullable<ReplyOptions["tone"]>, string> = {
  formal: "语气正式、礼貌。",
  friendly: "语气自然、友好。",
  concise: "尽量简短，直奔主题。",
};

/** 回复草稿：返回可直接放进写信框的正文（Markdown） */
export async function draftReply(config: AiConfig, email: EmailContext, options: ReplyOptions = {}): Promise<string> {
  const hints = [TONE_HINT[options.tone ?? "friendly"], options.instruction ? `要求：${options.instruction}` : ""]
    .filter(Boolean)
    .join(" ");

  return chat(
    config,
    [
      {
        role: "system",
        content:
          "你是邮件写作助手。基于来信起草一封回复，用简体中文，可用 Markdown。" +
          "只输出邮件正文，不要主题行、不要额外解释、不要代写签名占位符。" +
          hints,
      },
      { role: "user", content: `来信主题：${email.subject}\n来信人：${email.from}\n来信正文：\n${clip(email.text)}` },
    ],
    { temperature: 0.6, maxTokens: 800 },
  );
}
