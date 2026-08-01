import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Context } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listAccounts, verifyToken } from "./cf/client";
import { checkAccountPermissions } from "./cf/permissions";
import { deleteResources, listMailEdgeResources } from "./cf/resources";
import { getJob, startDeploy } from "./deploy";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8788);

const app = new Hono();

function page(name: string): string {
  return readFileSync(resolve(ROOT, "web", name), "utf8");
}

function staticFile(c: Context, name: string, mime: string): Response {
  c.header("Content-Type", mime);
  return c.body(readFileSync(resolve(ROOT, "web", name)));
}

/** 宣传首页 */
app.get("/", (c) => c.html(page("landing.html")));

/** 安装向导 */
app.get("/install", (c) => c.html(page("index.html")));

/** 开发者文档 */
app.get("/developers", (c) => c.html(page("developers.html")));

/** 共享样式 */
app.get("/styles.css", (c) => staticFile(c, "styles.css", "text/css; charset=utf-8"));

/** favicon 系列 */
app.get("/favicon.svg", (c) => staticFile(c, "favicon.svg", "image/svg+xml"));
app.get("/favicon.ico", (c) => staticFile(c, "favicon.ico", "image/x-icon"));
for (const size of ["16", "32", "48", "180", "192", "512"]) {
  app.get(`/favicon-${size}.png`, (c) => staticFile(c, `favicon-${size}.png`, "image/png"));
}
app.get("/site.webmanifest", (c) => staticFile(c, "site.webmanifest", "application/manifest+json; charset=utf-8"));

/**
 * 第一步：验证 token + 账户级权限体检。
 * 部署只需要 Workers/D1/R2 权限，不需要域名（收信由用户在 MailEdge 内自行管理）。
 */
app.post("/api/verify-token", async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  if (!token?.trim()) return c.json({ error: "缺少 token" }, 400);

  const ok = await verifyToken(token.trim());
  if (!ok) return c.json({ error: "token 无效或已过期，请重新创建" }, 401);

  const accounts = await listAccounts(token.trim());
  if (!accounts.length) {
    return c.json({ error: "这个 token 没有权限访问任何账户，请按页面指引补足权限" }, 403);
  }

  // 对前 3 个账户做只读权限体检（GET 探测，不产生任何修改）
  const checked = await Promise.all(
    accounts.slice(0, 3).map(async (account) => ({
      id: account.id,
      name: account.name,
      permissions: await checkAccountPermissions(token.trim(), account.id),
    })),
  );

  return c.json({ ok: true, accounts: checked });
});

/** 第二步：发起一键部署（后台异步执行，只建资源，不配置收信） */
app.post("/api/deploy", async (c) => {
  const body = await c.req
    .json<{ token: string; accountId: string }>()
    .catch(() => null);
  if (!body?.token?.trim() || !body.accountId) return c.json({ error: "缺少必要参数" }, 400);

  const jobId = await startDeploy(body.token.trim(), body.accountId);
  return c.json({ jobId });
});

/** 查询部署进度 */
app.get("/api/deploy/:id", (c) => {
  const job = getJob(c.req.param("id"));
  if (!job) return c.json({ error: "任务不存在" }, 404);
  return c.json({ status: job.status, log: job.log, url: job.url, error: job.error });
});

/** 卸载第一步：扫描该账户下的 MailEdge 资源（只读） */
app.post("/api/uninstall/list", async (c) => {
  const body = await c.req
    .json<{ token: string; accountId: string }>()
    .catch(() => null);
  if (!body || !body.token?.trim() || !body.accountId) return c.json({ error: "缺少必要参数" }, 400);
  const resources = await listMailEdgeResources(body.token.trim(), body.accountId);
  return c.json({ resources });
});

/** 卸载第二步：删除被勾选的资源 */
app.post("/api/uninstall", async (c) => {
  const body = await c.req
    .json<{ token: string; accountId: string; items: Array<{ kind: string; id: string; label: string; zoneId?: string }> }>()
    .catch(() => null);
  if (!body || !body.token?.trim() || !body.accountId || !Array.isArray(body.items) || !body.items.length) {
    return c.json({ error: "缺少必要参数" }, 400);
  }
  const results = await deleteResources(
    body.token.trim(),
    body.accountId,
    body.items.map((item) => ({ kind: item.kind as "worker" | "d1" | "r2" | "emailRule", id: item.id, label: item.label, zoneId: item.zoneId })),
  );
  return c.json({ results });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`MailEdge 安装向导已启动：http://127.0.0.1:${info.port}`);
});
