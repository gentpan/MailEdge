import { applyD1Migrations, createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createContact, getContact } from "../src/db/contacts";
import { createMailbox, getMailbox } from "../src/db/mailboxes";
import { createOutbound, getOutbound } from "../src/db/outbound";
import { createSession, createUser, type UserRecord } from "../src/db/users";
import type { Env } from "../src/env";
import worker from "../src/index";

const workerEnv = env as unknown as Env;
const BASE_URL = "https://mailedge.test";
const PASSWORD = "test-password-123";

let admin: UserRecord;
let user: UserRecord;
let other: UserRecord;
let adminToken: string;
let userToken: string;
let otherToken: string;

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM attachment_links"),
    env.DB.prepare("DELETE FROM outbound_messages"),
    env.DB.prepare("DELETE FROM mail_providers"),
    env.DB.prepare("DELETE FROM contacts"),
    env.DB.prepare("DELETE FROM mail_folders"),
    env.DB.prepare("DELETE FROM mailboxes"),
    env.DB.prepare("DELETE FROM passkey_credentials"),
    env.DB.prepare("DELETE FROM auth_challenges"),
    env.DB.prepare("DELETE FROM password_reset_tokens"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM settings"),
  ]);

  admin = await createUser(workerEnv, {
    email: "admin@example.com",
    password: PASSWORD,
    name: "Admin",
    role: "admin",
  });
  user = await createUser(workerEnv, {
    email: "user@example.com",
    password: PASSWORD,
    name: "User",
    role: "user",
  });
  other = await createUser(workerEnv, {
    email: "other@example.com",
    password: PASSWORD,
    name: "Other",
    role: "user",
  });

  adminToken = (await createSession(workerEnv, admin.id)).token;
  userToken = (await createSession(workerEnv, user.id)).token;
  otherToken = (await createSession(workerEnv, other.id)).token;
});

async function request(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Cookie", `mailedge_session=${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const context = createExecutionContext();
  const response = await worker.fetch(
    new Request(`${BASE_URL}${path}`, { ...init, headers }),
    workerEnv,
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}

function jsonRequest(path: string, method: string, body: unknown, token?: string): Promise<Response> {
  return request(path, { method, body: JSON.stringify(body) }, token);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("公开入口与会话边界", () => {
  it("健康检查、品牌资源和首次设置状态保持公开", async () => {
    const health = await request("/api/health");
    expect(health.status).toBe(200);
    await expect(json(health)).resolves.toMatchObject({ ok: true, service: "MailEdge" });

    const logo = await request("/api/brand/logo.svg");
    expect(logo.status).toBe(200);
    expect(logo.headers.get("Content-Type")).toContain("image/svg+xml");

    const setup = await request("/api/auth/setup");
    expect(setup.status).toBe(200);
    await expect(json(setup)).resolves.toMatchObject({ needsSetup: false });
  });

  it("实例初始化后拒绝匿名重新执行首次设置", async () => {
    const response = await jsonRequest("/api/auth/setup", "POST", {
      email: "attacker@example.com",
      password: "attacker-password",
      name: "Attacker",
    });

    expect(response.status).toBe(409);
    await expect(json(response)).resolves.toMatchObject({ error: "系统已初始化" });
    const attacker = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind("attacker@example.com")
      .first();
    expect(attacker).toBeNull();
  });

  it.each([
    ["GET", "/api/auth/me"],
    ["GET", "/api/mailboxes"],
    ["GET", "/api/folders"],
    ["GET", "/api/contacts"],
    ["GET", "/api/messages?mailboxId=all"],
    ["GET", "/api/mail/outbox"],
    ["GET", "/api/providers"],
    ["GET", "/api/ai/config"],
    ["GET", "/api/update/version"],
    ["GET", "/api/storage/config"],
    ["GET", "/api/usage"],
    ["GET", "/api/attachments"],
    ["GET", "/api/shares"],
    ["GET", "/api/brand/avatar?domain=example.com"],
    ["POST", "/api/mail/send"],
    ["POST", "/api/mail/attachment"],
  ])("未登录请求 %s %s 一律返回 401", async (method, path) => {
    const response = await request(path, { method });
    expect(response.status).toBe(401);
    await expect(json(response)).resolves.toMatchObject({ error: "未登录" });
  });

  it("伪造、失效或已停用账户的会话都不能访问业务 API", async () => {
    const forged = await request("/api/auth/me", {}, "forged-session-token");
    expect(forged.status).toBe(401);
    await expect(json(forged)).resolves.toMatchObject({ error: "会话已失效，请重新登录" });

    await env.DB.prepare("UPDATE users SET is_enabled = 0 WHERE id = ?").bind(user.id).run();
    const disabled = await request("/api/auth/me", {}, userToken);
    expect(disabled.status).toBe(401);
    await expect(json(disabled)).resolves.toMatchObject({ error: "会话已失效，请重新登录" });
  });
});

describe("管理员权限边界", () => {
  it("普通用户不能写入实例级配置，拒绝后数据库保持不变", async () => {
    const attempts = [
      jsonRequest("/api/providers", "POST", { name: "Forbidden", type: "cloudflare", config: {} }, userToken),
      jsonRequest(
        "/api/ai/config",
        "POST",
        { enabled: true, baseUrl: "https://ai.invalid/v1", apiKey: "secret", model: "test" },
        userToken,
      ),
      request("/api/ai/config/test", { method: "POST" }, userToken),
      jsonRequest(
        "/api/ai/telegram",
        "POST",
        { enabled: true, botToken: "secret", chatId: "123" },
        userToken,
      ),
      request("/api/ai/telegram/test", { method: "POST" }, userToken),
      jsonRequest("/api/storage/config", "POST", { backend: "r2" }, userToken),
      jsonRequest("/api/storage/retention", "POST", { days: 90 }, userToken),
    ];

    const responses = await Promise.all(attempts);
    for (const response of responses) {
      expect(response.status).toBe(403);
      await expect(json(response)).resolves.toMatchObject({ error: "需要管理员权限" });
    }

    const providerCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM mail_providers").first<{
      count: number;
    }>();
    const settingCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM settings").first<{
      count: number;
    }>();
    expect(providerCount?.count).toBe(0);
    expect(settingCount?.count).toBe(0);
  });

  it("管理员可以写配置，普通用户读取渠道时看不到任何密钥", async () => {
    const me = await request("/api/auth/me", {}, adminToken);
    expect(me.status).toBe(200);
    await expect(json(me)).resolves.toMatchObject({ user: { id: admin.id, role: "admin" } });

    const provider = await jsonRequest(
      "/api/providers",
      "POST",
      {
        name: "Resend production",
        type: "resend",
        config: { apiKey: "re_super_secret", verifiedDomains: ["example.com"] },
      },
      adminToken,
    );
    expect(provider.status).toBe(200);
    expect(JSON.stringify(await json(provider))).not.toContain("re_super_secret");

    const retention = await jsonRequest("/api/storage/retention", "POST", { days: 180 }, adminToken);
    expect(retention.status).toBe(200);
    await expect(json(retention)).resolves.toMatchObject({ outboundRetentionDays: 180 });

    const ai = await jsonRequest(
      "/api/ai/config",
      "POST",
      { enabled: true, baseUrl: "https://api.example.test/v1", apiKey: "ai_super_secret", model: "model" },
      adminToken,
    );
    expect(ai.status).toBe(200);
    expect(JSON.stringify(await json(ai))).not.toContain("ai_super_secret");

    const userView = await request("/api/providers", {}, userToken);
    expect(userView.status).toBe(200);
    const userPayload = await json(userView);
    expect(userPayload).toMatchObject({
      providers: [{ name: "Resend production", type: "resend" }],
    });
    expect(JSON.stringify(userPayload)).not.toMatch(/apiKey|config|re_super_secret/);
  });
});

describe("跨账户对象 IDOR 基线", () => {
  it("不能读取、修改或删除其他账户的联系人", async () => {
    const contact = await createContact(workerEnv, other.id, {
      email: "private@other.test",
      name: "Private contact",
      notes: "must stay private",
    });

    const read = await request(`/api/contacts/${contact.id}`, {}, userToken);
    expect(read.status).toBe(404);

    const update = await jsonRequest(
      `/api/contacts/${contact.id}`,
      "PATCH",
      { email: "stolen@example.com", name: "Stolen" },
      userToken,
    );
    expect(update.status).toBe(400);

    const remove = await request(`/api/contacts/${contact.id}`, { method: "DELETE" }, userToken);
    expect(remove.status).toBe(404);
    await expect(getContact(workerEnv, other.id, contact.id)).resolves.toMatchObject({
      email: "private@other.test",
      name: "Private contact",
    });
  });

  it("不能修改或删除其他账户的信箱", async () => {
    const mailbox = await createMailbox(workerEnv, {
      address: "private@other.test",
      userId: other.id,
      displayName: "Private mailbox",
    });

    const update = await jsonRequest(
      `/api/mailboxes/${mailbox.id}`,
      "PATCH",
      { displayName: "Hijacked" },
      userToken,
    );
    expect(update.status).toBe(404);

    const remove = await request(`/api/mailboxes/${mailbox.id}`, { method: "DELETE" }, userToken);
    expect(remove.status).toBe(404);
    await expect(getMailbox(workerEnv, mailbox.id)).resolves.toMatchObject({
      userId: other.id,
      displayName: "Private mailbox",
    });
  });

  it("不能读取或重试其他账户的发信记录", async () => {
    await createOutbound(workerEnv, {
      id: "mail_other_private",
      userId: other.id,
      mailboxId: null,
      input: {
        from: { email: "private@other.test" },
        to: [{ email: "recipient@example.com" }],
        subject: "Private subject",
        text: "Private body",
      },
      payloadKey: "outbound/private/payload.json",
    });

    const read = await request("/api/mail/outbox/mail_other_private", {}, userToken);
    expect(read.status).toBe(404);

    const retry = await request("/api/mail/outbox/mail_other_private/retry", { method: "POST" }, userToken);
    expect(retry.status).toBe(404);
    await expect(getOutbound(workerEnv, "mail_other_private")).resolves.toMatchObject({
      userId: other.id,
      status: "queued",
      attempts: 0,
    });
  });

  it("不能列出、撤销或删除其他账户的附件分享", async () => {
    await env.DB.prepare(
      `INSERT INTO attachment_links
       (token, r2_key, filename, content_type, size, user_id, is_revoked)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    )
      .bind("share_other_private", "shares/other/private.txt", "private.txt", "text/plain", 7, other.id)
      .run();

    const list = await request("/api/shares", {}, userToken);
    expect(list.status).toBe(200);
    await expect(json(list)).resolves.toMatchObject({ shares: [] });

    const revoke = await request("/api/shares/share_other_private/revoke", { method: "POST" }, userToken);
    expect(revoke.status).toBe(404);

    const remove = await jsonRequest(
      "/api/attachments",
      "DELETE",
      { source: "share", token: "share_other_private" },
      userToken,
    );
    expect(remove.status).toBe(404);

    const row = await env.DB.prepare("SELECT user_id, is_revoked FROM attachment_links WHERE token = ?")
      .bind("share_other_private")
      .first<{ user_id: string; is_revoked: number }>();
    expect(row).toEqual({ user_id: other.id, is_revoked: 0 });
  });

  it("会话只映射到自己的账户，另一位用户仍能访问自己的数据", async () => {
    const response = await request("/api/auth/me", {}, otherToken);
    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toMatchObject({ user: { id: other.id, email: other.email } });
  });
});
