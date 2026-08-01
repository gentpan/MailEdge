import { Hono } from "hono";
import { AiError, chat } from "../ai/client";
import type { EmailContext, ReplyOptions } from "../ai/tasks";
import { classifyEmail, draftReply, summarizeEmail } from "../ai/tasks";
import type { AiConfig, MailCategory, TelegramConfig } from "../ai/types";
import { CATEGORY_LABELS, isMailCategory } from "../ai/types";
import {
  getAiConfig,
  getTelegramConfig,
  redactAi,
  redactTelegram,
  saveAiConfig,
  saveTelegramConfig,
} from "../db/appSettings";
import type { MailboxRecord } from "../db/mailboxes";
import { listMailboxes, mailboxStub } from "../db/mailboxes";
import type { Env } from "../env";
import type { MessageDetail } from "../shared/message";
import { stripHtml } from "../shared/text";
import { requireAdmin, requireAuth } from "./auth";
import type { AppContext } from "./context";

const ai = new Hono<AppContext>();
ai.use("*", requireAuth);

// ---- 配置 ----

ai.get("/config", async (c) => {
  const [aiConfig, telegram] = await Promise.all([getAiConfig(c.env), getTelegramConfig(c.env)]);
  const isAdmin = c.get("user").role === "admin";
  return c.json({
    // 普通用户只需要知道 AI 是否可用（决定要不要显示 AI 按钮）
    ai: isAdmin ? redactAi(aiConfig) : { enabled: aiConfig.enabled && Boolean(aiConfig.apiKey) },
    telegram: isAdmin ? redactTelegram(telegram) : { enabled: telegram.enabled },
    categories: CATEGORY_LABELS,
  });
});

ai.post("/config", requireAdmin, async (c) => {
  const body = await c.req.json<Partial<AiConfig> & { apiKey?: string }>();
  const current = await getAiConfig(c.env);

  const next: AiConfig = {
    enabled: body.enabled ?? current.enabled,
    baseUrl: body.baseUrl?.trim() || current.baseUrl,
    // 留空或脱敏值表示沿用原 Key
    apiKey: keepSecret(body.apiKey, current.apiKey),
    model: body.model?.trim() || current.model,
    autoClassify: body.autoClassify ?? current.autoClassify,
  };
  await saveAiConfig(c.env, next);
  return c.json({ ai: redactAi(next) });
});

ai.post("/config/test", requireAdmin, async (c) => {
  const config = await getAiConfig(c.env);
  try {
    const reply = await chat(config, [{ role: "user", content: "回复 OK 两个字即可" }], { maxTokens: 10 });
    return c.json({ ok: true, reply });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof AiError ? error.message : "调用失败" }, 502);
  }
});

ai.post("/telegram", requireAdmin, async (c) => {
  const body = await c.req.json<Partial<TelegramConfig> & { botToken?: string }>();
  const current = await getTelegramConfig(c.env);

  const next: TelegramConfig = {
    enabled: body.enabled ?? current.enabled,
    botToken: keepSecret(body.botToken, current.botToken),
    chatId: body.chatId?.trim() || current.chatId,
    onlyCategories: sanitizeCategories(body.onlyCategories) ?? current.onlyCategories,
  };
  await saveTelegramConfig(c.env, next);
  return c.json({ telegram: redactTelegram(next) });
});

ai.post("/telegram/test", requireAdmin, async (c) => {
  const { sendTelegramTest } = await import("../notify/telegram");
  const result = await sendTelegramTest(await getTelegramConfig(c.env));
  return c.json(result, result.ok ? 200 : 502);
});

// ---- 针对具体邮件的 AI 操作 ----

ai.post("/messages/:id/reply", async (c) => {
  const { message } = await loadMessage(c);
  if (!message) return c.json({ error: "邮件不存在" }, 404);

  const config = await requireEnabled(c.env);
  if ("error" in config) return c.json({ error: config.error }, 400);

  const body: { instruction?: string; tone?: ReplyOptions["tone"] } = await c.req
    .json<{ instruction?: string; tone?: ReplyOptions["tone"] }>()
    .catch(() => ({}));
  try {
    const draft = await draftReply(config.value, toContext(message), {
      instruction: body.instruction,
      tone: body.tone,
    });
    return c.json({ draft });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "生成失败" }, 502);
  }
});

ai.post("/messages/:id/summarize", async (c) => {
  const { message, mailbox } = await loadMessage(c);
  if (!message || !mailbox) return c.json({ error: "邮件不存在" }, 404);

  // 已有摘要直接返回，除非显式要求重算
  const force = c.req.query("force") === "1";
  if (message.aiSummary && !force) return c.json({ summary: message.aiSummary, cached: true });

  const config = await requireEnabled(c.env);
  if ("error" in config) return c.json({ error: config.error }, 400);

  try {
    const summary = await summarizeEmail(config.value, toContext(message));
    await mailboxStub(c.env, mailbox).setSummary(message.id, summary);
    return c.json({ summary, cached: false });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "生成失败" }, 502);
  }
});

ai.post("/messages/:id/classify", async (c) => {
  const { message, mailbox } = await loadMessage(c);
  if (!message || !mailbox) return c.json({ error: "邮件不存在" }, 404);

  const config = await requireEnabled(c.env);
  if ("error" in config) return c.json({ error: config.error }, 400);

  try {
    const category = await classifyEmail(config.value, toContext(message));
    await mailboxStub(c.env, mailbox).setCategory(message.id, category);
    return c.json({ category, label: CATEGORY_LABELS[category] });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "分类失败" }, 502);
  }
});

// ---- 辅助 ----

async function requireEnabled(env: Env): Promise<{ value: AiConfig } | { error: string }> {
  const config = await getAiConfig(env);
  if (!config.enabled || !config.apiKey) return { error: "AI 功能未启用，请先在设置中配置" };
  return { value: config };
}

async function resolveMailbox(env: Env, userId: string, mailboxId?: string): Promise<MailboxRecord | null> {
  const mailboxes = await listMailboxes(env, userId);
  if (!mailboxes.length) return null;
  if (!mailboxId || mailboxId === "all") return null; // 具体邮件操作必须指定信箱
  return mailboxes.find((item) => item.id === mailboxId) ?? null;
}

async function loadMessage(c: {
  env: Env;
  get: (k: "user") => { id: string };
  req: { query: (k: string) => string | undefined; param: (k: string) => string };
}): Promise<{ message: MessageDetail | null; mailbox: MailboxRecord | null }> {
  const mailbox = await resolveMailbox(c.env, c.get("user").id, c.req.query("mailboxId"));
  if (!mailbox) return { message: null, mailbox: null };
  const message = await mailboxStub(c.env, mailbox).get(c.req.param("id"));
  return { message, mailbox };
}

function toContext(message: MessageDetail): EmailContext {
  return {
    subject: message.subject,
    from: message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email,
    text: message.text ?? stripHtml(message.html ?? ""),
  };
}

function keepSecret(incoming: string | undefined, previous: string): string {
  const value = incoming?.trim() ?? "";
  if (!value || value.includes("••")) return previous;
  return value;
}

function sanitizeCategories(value: unknown): MailCategory[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is MailCategory => typeof item === "string" && isMailCategory(item));
}

export default ai;
