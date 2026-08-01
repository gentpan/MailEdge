import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listAccounts, listZones, verifyToken } from "./cf/client";
import { configureEmailRouting } from "./cf/email";
import { getJob, startDeploy } from "./deploy";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8788);
const WORKER_NAME = "mailedge";

const app = new Hono();

app.get("/", (c) => {
  const html = readFileSync(resolve(ROOT, "web/index.html"), "utf8");
  return c.html(html);
});

/** 第一步：验证 token 并返回 token 有权限的账户 */
app.post("/api/verify-token", async (c) => {
  const { token } = await c.req.json<{ token: string }>();
  if (!token?.trim()) return c.json({ error: "缺少 token" }, 400);

  const ok = await verifyToken(token.trim());
  if (!ok) return c.json({ error: "token 无效或已过期，请重新创建" }, 401);

  const accounts = await listAccounts(token.trim());
  if (!accounts.length) {
    return c.json({ error: "这个 token 没有权限访问任何账户，请按页面指引补足权限" }, 403);
  }
  return c.json({ ok: true, accounts });
});

/** 第二步：列出某账户下托管在 Cloudflare 的域名 */
app.post("/api/zones", async (c) => {
  const { token, accountId } = await c.req.json<{ token: string; accountId: string }>();
  if (!token || !accountId) return c.json({ error: "缺少参数" }, 400);

  const zones = await listZones(token, accountId);
  return c.json({ zones });
});

/** 第三步：发起一键部署（后台异步执行） */
app.post("/api/deploy", async (c) => {
  const body = await c.req
    .json<{ token: string; accountId: string; zoneId: string; address: string; catchAll: boolean }>()
    .catch(() => null);
  if (!body?.token || !body.accountId || !body.zoneId) return c.json({ error: "缺少必要参数" }, 400);

  const address = body.address?.trim().toLowerCase();
  const catchAll = body.catchAll === true || !address;
  if (!catchAll && !/^[a-z0-9._%+-]{1,64}$/.test(address ?? "")) {
    return c.json({ error: "收件地址格式不正确（只能包含字母数字和 . _ % + -）" }, 400);
  }

  const jobId = await startDeploy(body.token, body.accountId);

  // 部署完成后配置 Email Routing（依赖 Worker 已存在）
  void (async () => {
    const job = getJob(jobId);
    if (!job) return;
    const waitFor = setInterval(() => {
      if (job.status === "running") return;
      clearInterval(waitFor);
      if (job.status !== "done") return;
      configureEmailRouting(body.token, body.zoneId, WORKER_NAME, { address, catchAll })
        .then(() => {
          job.log += `\n✓ Email Routing 已配置：来信将转发到 ${WORKER_NAME} Worker\n`;
          if (!catchAll && address) {
            job.log += `  · 收件地址：${address}@你的域名\n`;
          }
        })
        .catch((error) => {
          job.log += `\n⚠ Email Routing 配置失败：${error instanceof Error ? error.message : String(error)}\n`;
          job.log += "   可在 Cloudflare 面板手动配置（Email Service → Email Routing → Routing rules）\n";
        });
    }, 3000);
  })();

  return c.json({ jobId });
});

/** 查询部署进度 */
app.get("/api/deploy/:id", (c) => {
  const job = getJob(c.req.param("id"));
  if (!job) return c.json({ error: "任务不存在" }, 404);
  return c.json({ status: job.status, log: job.log, url: job.url, error: job.error });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`MailEdge 安装向导已启动：http://127.0.0.1:${info.port}`);
});
