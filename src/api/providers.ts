import { Hono } from "hono";
import {
  deleteProvider,
  getProvider,
  listProviders,
  redactProvider,
  setDefaultProvider,
  upsertProvider,
} from "../db/providers";
import { createMailProvider } from "../mail/factory";
import { newMessageId } from "../lib/id";
import type { MailProviderConfig, MailProviderType } from "../mail/types";
import { requireAdmin, requireAuth } from "./auth";
import type { AppContext } from "./context";

const providers = new Hono<AppContext>();

providers.use("*", requireAuth);

/** 普通用户只需要知道有哪些渠道可选；密钥一律不下发 */
providers.get("/", async (c) => {
  const all = await listProviders(c.env);
  const user = c.get("user");

  if (user.role !== "admin") {
    return c.json({
      providers: all
        .filter((item) => item.isEnabled)
        .map((item) => ({ id: item.id, name: item.name, type: item.type, isDefault: item.isDefault })),
    });
  }

  return c.json({ providers: all.map(redactProvider) });
});

providers.post("/", requireAdmin, async (c) => {
  const body = await c.req.json<{
    id?: string;
    name: string;
    type: MailProviderType;
    config: Record<string, unknown>;
    isEnabled?: boolean;
    isDefault?: boolean;
    priority?: number;
  }>();

  const config = await normalizeConfig(c, body.type, body.config, body.id);
  if ("error" in config) return c.json({ error: config.error }, 400);

  const record = await upsertProvider(c.env, {
    id: body.id,
    name: body.name?.trim() || defaultName(body.type),
    type: body.type,
    config: config.value,
    isEnabled: body.isEnabled,
    isDefault: body.isDefault,
    priority: body.priority,
  });

  return c.json({ provider: redactProvider(record) });
});

providers.post("/:id/default", requireAdmin, async (c) => {
  await setDefaultProvider(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

providers.delete("/:id", requireAdmin, async (c) => {
  await deleteProvider(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

/** 测试发送：绕过状态机，直接用指定渠道发一封，用于验证配置 */
providers.post("/:id/test", requireAdmin, async (c) => {
  const record = await getProvider(c.env, c.req.param("id"));
  if (!record) return c.json({ error: "渠道不存在" }, 404);

  const body = await c.req.json<{ from: string; to: string }>();
  if (!body.from || !body.to) return c.json({ error: "请填写发件地址与收件地址" }, 400);

  const internalId = newMessageId();
  const provider = createMailProvider(c.env, record.config, internalId);
  const result = await provider.send({
    from: { email: body.from, name: "MailEdge" },
    to: [{ email: body.to }],
    subject: `MailEdge 测试邮件（${record.name}）`,
    text: `这是一封来自 MailEdge 的测试邮件。\n\n渠道：${record.name}（${record.type}）\n内部 ID：${internalId}`,
    html: `<p>这是一封来自 <strong>MailEdge</strong> 的测试邮件。</p><p>渠道：${record.name}（${record.type}）<br>内部 ID：<code>${internalId}</code></p>`,
  });

  return c.json({ result }, result.success ? 200 : 502);
});

function defaultName(type: MailProviderType): string {
  return {
    cloudflare: "Cloudflare Email Service",
    resend: "Resend",
    sendflare: "Sendflare",
    smtp: "SMTP",
  }[type];
}

/**
 * 编辑已有渠道时前端拿到的是脱敏密钥，留空表示沿用原值。
 */
async function normalizeConfig(
  c: { env: AppContext["Bindings"] },
  type: MailProviderType,
  raw: Record<string, unknown>,
  existingId?: string,
): Promise<{ value: MailProviderConfig } | { error: string }> {
  const existing = existingId ? await getProvider(c.env, existingId) : null;
  const keep = (incoming: unknown, previous: string | undefined): string | undefined => {
    const value = typeof incoming === "string" ? incoming.trim() : "";
    if (!value || value.includes("••")) return previous;
    return value;
  };

  if (type === "cloudflare") {
    return {
      value: {
        type: "cloudflare",
        defaultDomain: typeof raw.defaultDomain === "string" ? raw.defaultDomain.trim() : undefined,
      },
    };
  }

  if (type === "resend") {
    const previous = existing?.config.type === "resend" ? existing.config.apiKey : undefined;
    const apiKey = keep(raw.apiKey, previous);
    if (!apiKey) return { error: "请填写 Resend API Key" };
    return { value: { type: "resend", apiKey, verifiedDomains: toStringArray(raw.verifiedDomains) } };
  }

  if (type === "sendflare") {
    const previousToken = existing?.config.type === "sendflare" ? existing.config.token : undefined;
    const previousSecret = existing?.config.type === "sendflare" ? existing.config.secret : undefined;
    const token = keep(raw.token, previousToken);
    if (!token) return { error: "请填写 Sendflare API Token" };
    return {
      value: {
        type: "sendflare",
        token,
        secret: keep(raw.secret, previousSecret),
        baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : undefined,
        verifiedDomains: toStringArray(raw.verifiedDomains),
      },
    };
  }

  if (type === "smtp") {
    const previous = existing?.config.type === "smtp" ? existing.config.password : undefined;
    const host = typeof raw.host === "string" ? raw.host.trim() : "";
    const username = typeof raw.username === "string" ? raw.username.trim() : "";
    const password = keep(raw.password, previous);
    const port = Number(raw.port) || 587;
    const security = raw.security === "tls" ? "tls" : "starttls";
    if (!host) return { error: "请填写 SMTP 服务器地址" };
    if (!username) return { error: "请填写 SMTP 用户名" };
    if (!password) return { error: "请填写 SMTP 密码（Gmail 用应用专用密码）" };
    if (port === 25) return { error: "Workers 禁止 25 端口，请用 587（STARTTLS）或 465（TLS）" };
    return { value: { type: "smtp", host, port, username, password, security } };
  }

  return { error: `不支持的邮件服务：${type}` };
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

export default providers;
