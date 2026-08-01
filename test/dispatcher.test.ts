import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createOutbound, getOutbound } from "../src/db/outbound";
import { upsertProvider } from "../src/db/providers";
import { dispatch } from "../src/mail/dispatcher";
import type { SendMailInput } from "../src/mail/types";

const INPUT: SendMailInput = {
  from: { email: "me@example.com" },
  to: [{ email: "you@example.com" }],
  subject: "Hello",
  text: "hi",
};

/**
 * 按顺序排好的 Resend 响应，每次发信弹一个。
 * 队列见底就抛错——这样「本该只发一次却发了两次」会直接失败，
 * 而不是悄悄命中一个通配的 mock。
 */
let queued: Array<{ status: number; body: unknown }> = [];
let requests: Array<{ url: string; body: Record<string, unknown>; auth: string }> = [];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as RequestInfo, init);
    const next = queued.shift();
    if (!next) throw new Error(`未预期的外发请求：${request.method} ${request.url}`);

    requests.push({
      url: request.url,
      body: JSON.parse(await request.text()) as Record<string, unknown>,
      auth: request.headers.get("Authorization") ?? "",
    });

    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  });
});

beforeEach(async () => {
  queued = [];
  requests = [];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mail_providers"),
    env.DB.prepare("DELETE FROM outbound_messages"),
  ]);
});

afterEach(() => {
  // 有剩余说明预期的请求没发出去，同样是问题
  expect(queued, "还有未被消费的模拟响应").toHaveLength(0);
});

/** 注册一个 Resend 渠道；priority 越小越优先 */
async function addResend(name: string, priority: number, apiKey = "re_test") {
  return upsertProvider(env, {
    name,
    type: "resend",
    config: { type: "resend", apiKey },
    priority,
  });
}

/** 排入一次 Resend 响应 */
function mockResend(status: number, body: unknown) {
  queued.push({ status, body });
}

/**
 * 真实链路里 API 层会先落一条 queued 记录再交给 dispatch，
 * 测试照做，否则状态机的写入会全部落空。
 */
async function send(internalId: string, options: { preferredProviderId?: string } = {}) {
  await createOutbound(env, {
    id: internalId,
    userId: null,
    mailboxId: null,
    input: INPUT,
    payloadKey: null,
  });
  return dispatch(env, { internalId, input: INPUT, ...options });
}

async function record(id: string) {
  const row = await getOutbound(env, id);
  if (!row) throw new Error("发信记录不存在");
  return row;
}

describe("没有可用渠道", () => {
  it("直接 failed，并提示去哪里配置", async () => {
    const result = await send("mail_none");

    expect(result.status).toBe("failed");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/发信渠道/);
  });

  it("被禁用的渠道不参与发送", async () => {
    await upsertProvider(env, {
      name: "停用的",
      type: "resend",
      config: { type: "resend", apiKey: "re_x" },
      isEnabled: false,
    });

    const result = await send("mail_disabled");
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/发信渠道/);
  });
});

describe("首个渠道成功", () => {
  it("落 sent，并记下 Provider 侧的消息 ID", async () => {
    await addResend("主渠道", 10);
    mockResend(200, { id: "re_abc123" });

    const result = await send("mail_ok");

    expect(result.status).toBe("sent");
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("re_abc123");

    const row = await record("mail_ok");
    expect(row.status).toBe("sent");
    expect(row.providerMessageId).toBe("re_abc123");
    expect(row.lastError).toBeNull();
    expect(row.nextRetryAt).toBeNull();
  });

  it("成功后不再尝试后备渠道", async () => {
    await addResend("主渠道", 10);
    await addResend("备用", 20);
    mockResend(200, { id: "re_1" });

    const result = await send("mail_once");

    expect(result.attempts).toHaveLength(1);
    expect(requests).toHaveLength(1);
  });

  it("把内部 ID 作为 X-App-Message-ID 带给 Provider，便于跨渠道去重", async () => {
    await addResend("主渠道", 10);
    mockResend(200, { id: "re_1" });

    await send("mail_hdr");

    const headers = requests[0]?.body.headers as Record<string, string>;
    expect(headers["X-App-Message-ID"]).toBe("mail_hdr");
  });
});

describe("临时故障：切备用渠道", () => {
  it("主渠道 5xx 时改用备用渠道并成功", async () => {
    await addResend("主渠道", 10);
    await addResend("备用", 20);
    mockResend(503, { message: "service unavailable" });
    mockResend(200, { id: "re_fallback" });

    const result = await send("mail_fb");

    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("re_fallback");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.success).toBe(false);
    expect(result.attempts[0]?.failureKind).toBe("transient");
    expect(result.attempts[1]?.success).toBe(true);
  });

  it("429 限流同样切备用", async () => {
    await addResend("主渠道", 10);
    await addResend("备用", 20);
    mockResend(429, { message: "too many requests" });
    mockResend(200, { id: "re_2" });

    expect((await send("mail_429")).status).toBe("sent");
  });
});

describe("永久失败：绝不换渠道重发", () => {
  it("域名未验证时立即 failed，后备渠道一次都不碰", async () => {
    await addResend("主渠道", 10);
    await addResend("备用", 20);
    mockResend(403, { message: "The example.com domain is not verified" });

    const result = await send("mail_perm");

    expect(result.status).toBe("failed");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.failureKind).toBe("permanent");
    // 只发出一次请求，备用渠道根本没被碰过
    expect(requests).toHaveLength(1);

    const row = await record("mail_perm");
    expect(row.status).toBe("failed");
    expect(row.nextRetryAt).toBeNull();
  });

  it("收件地址非法时也是永久失败", async () => {
    await addResend("主渠道", 10);
    mockResend(422, { message: "invalid recipient address" });

    const result = await send("mail_badaddr");
    expect(result.status).toBe("failed");
    expect(result.attempts).toHaveLength(1);
  });
});

describe("全部临时失败：延迟重试", () => {
  it("落 deferred 并排下一次重试时间", async () => {
    await addResend("主渠道", 10);
    await addResend("备用", 20);
    mockResend(503, { message: "unavailable" });
    mockResend(500, { message: "internal error" });

    const before = Date.now();
    const result = await send("mail_defer");

    expect(result.status).toBe("deferred");
    expect(result.attempts).toHaveLength(2);

    const row = await record("mail_defer");
    expect(row.status).toBe("deferred");
    expect(row.nextRetryAt).toBeTruthy();
    expect(new Date(row.nextRetryAt as string).getTime()).toBeGreaterThan(before);
  });

  it("重试次数累计到上限后转 failed，不再无限重试", async () => {
    const provider = await addResend("唯一渠道", 10);

    // 先造一条已经攒了 4 次失败的记录，本轮第 5 次即到顶
    await createOutbound(env, {
      id: "mail_max",
      userId: null,
      mailboxId: null,
      input: INPUT,
      payloadKey: null,
    });
    await env.DB.prepare("UPDATE outbound_messages SET attempts = 4 WHERE id = ?").bind("mail_max").run();
    expect(provider.isEnabled).toBe(true);

    mockResend(503, { message: "unavailable" });
    const result = await dispatch(env, { internalId: "mail_max", input: INPUT });

    expect(result.status).toBe("failed");
    const row = await record("mail_max");
    expect(row.lastError).toMatch(/重试 5 次后仍失败/);
    expect(row.nextRetryAt).toBeNull();
  });
});

describe("渠道顺序", () => {
  it("preferredProviderId 指定的渠道排到最前", async () => {
    await addResend("默认在前", 10, "re_default");
    const preferred = await addResend("指定这个", 99, "re_preferred");
    mockResend(200, { id: "re_1" });

    const result = await send("mail_pref", { preferredProviderId: preferred.id });

    expect(result.status).toBe("sent");
    expect(result.attempts[0]?.providerId).toBe(preferred.id);
    // 用的确实是被指定渠道的密钥
    expect(requests[0]?.auth).toBe("Bearer re_preferred");
  });
});

describe("渠道健康状态", () => {
  it("成功后清空 last_error", async () => {
    const provider = await addResend("主渠道", 10);
    await env.DB.prepare("UPDATE mail_providers SET last_error = ? WHERE id = ?")
      .bind("上次失败了", provider.id)
      .run();

    mockResend(200, { id: "re_1" });
    await send("mail_health_ok");

    const row = await env.DB.prepare("SELECT last_error, last_checked_at FROM mail_providers WHERE id = ?")
      .bind(provider.id)
      .first<{ last_error: string | null; last_checked_at: string | null }>();
    expect(row?.last_error).toBeNull();
    expect(row?.last_checked_at).toBeTruthy();
  });

  it("失败后记录错误原因，供设置页展示", async () => {
    const provider = await addResend("主渠道", 10);
    mockResend(403, { message: "domain is not verified" });

    await send("mail_health_bad");

    const row = await env.DB.prepare("SELECT last_error FROM mail_providers WHERE id = ?")
      .bind(provider.id)
      .first<{ last_error: string | null }>();
    expect(row?.last_error).toMatch(/not verified/);
  });
});
