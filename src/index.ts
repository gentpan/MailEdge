import { Hono } from "hono";
import ai from "./api/ai";
import auth from "./api/auth";
import type { AppContext } from "./api/context";
import download from "./api/download";
import messages from "./api/messages";
import providers from "./api/providers";
import send from "./api/send";
import { listMailboxes, mailboxStub } from "./db/mailboxes";
import { listRetryable, loadPayload } from "./db/outbound";
import { handleInboundEmail } from "./email/inbound";
import type { Env } from "./env";
import { dispatch } from "./mail/dispatcher";

export { MailboxDO } from "./do/mailbox";

const app = new Hono<AppContext>();

// 健康检查必须注册在 messages 子应用（挂在 /api 上并带鉴权中间件）之前
app.get("/api/health", (c) => c.json({ ok: true, service: "MailEdge" }));

app.route("/api/auth", auth);
app.route("/api/mail", send);
app.route("/api/providers", providers);
app.route("/api/ai", ai);
app.route("/api", messages);
app.route("/", download);

app.onError((error, c) => {
  console.error("[MailEdge]", error);
  return c.json({ error: error instanceof Error ? error.message : "服务器内部错误" }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "接口不存在" }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,

  /** Cloudflare Email Routing 投递入口 */
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleInboundEmail(message, env, ctx);
  },

  /** 定时重试 deferred 邮件，并清理过期的附件分享 */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(retryDeferred(env));
    ctx.waitUntil(cleanupExpiredShares(env));
  },
} satisfies ExportedHandler<Env>;

async function retryDeferred(env: Env): Promise<void> {
  const pending = await listRetryable(env, 20);

  for (const record of pending) {
    if (!record.payloadKey) continue;

    // 抢占：cron 只处理仍处于 deferred 的记录。
    // 若用户已手动重试（状态已变 sending/sent/failed），更新 0 行则跳过，
    // 避免 cron 与手动重试并发把同一封邮件发两遍。
    const claimed = await env.DB.prepare(
      `UPDATE outbound_messages SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'deferred'`,
    )
      .bind(new Date().toISOString(), record.id)
      .run();
    if (!claimed.meta.changes) continue;

    const input = await loadPayload(env, record.payloadKey);
    if (!input) continue;

    const result = await dispatch(env, { internalId: record.id, input });

    if (record.userId && record.mailboxId) {
      const mailbox = (await listMailboxes(env, record.userId)).find((item) => item.id === record.mailboxId);
      if (mailbox) {
        await mailboxStub(env, mailbox).updateOutboundStatus(record.id, {
          status: result.status,
          provider: result.provider,
          error: result.error ?? null,
        });
      }
    }
  }
}

async function cleanupExpiredShares(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT token, r2_key FROM attachment_links WHERE expires_at IS NOT NULL AND expires_at < ? LIMIT 100`,
  )
    .bind(new Date().toISOString())
    .all<{ token: string; r2_key: string }>();

  if (!results.length) return;

  await env.R2.delete(results.map((row) => row.r2_key));
  const placeholders = results.map(() => "?").join(", ");
  await env.DB.prepare(`DELETE FROM attachment_links WHERE token IN (${placeholders})`)
    .bind(...results.map((row) => row.token))
    .run();
}
