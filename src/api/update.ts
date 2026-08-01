import { Hono } from "hono";
import { decryptUpdateToken, getUpdateConfig, saveUpdateConfig } from "../db/appSettings";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

/**
 * 界面内一键更新。
 * 原理：用户保存一个更新 Token（AES-GCM 加密存 D1），点「一键更新」时
 * MailEdge 后端带着 Token 去请求安装向导（deployer）的 /api/deploy——
 * 部署脚本是幂等的，会复用已有数据库/存储/机密，只把最新 Worker 代码部署上去。
 */
const update = new Hono<AppContext>();
update.use("*", requireAuth);

/** 当前更新配置状态（Token 只回布尔，不回内容） */
update.get("/config", async (c) => {
  const cfg = await getUpdateConfig(c.env);
  return c.json({ hasToken: Boolean(cfg.tokenEncrypted), accountId: cfg.accountId });
});

/** 保存更新配置：token 与 accountId 任一不传则保持原样，传空字符串清除 */
update.post("/config", async (c) => {
  const body = await c.req.json<{ token?: string; accountId?: string }>().catch(() => null);
  if (!body) return c.json({ error: "请求体格式不正确" }, 400);

  const cfg = await saveUpdateConfig(c.env, {
    token: typeof body.token === "string" ? body.token.trim() : undefined,
    accountId: typeof body.accountId === "string" ? body.accountId.trim() : undefined,
  });
  return c.json({ hasToken: Boolean(cfg.tokenEncrypted), accountId: cfg.accountId });
});

/** 一键更新：请求安装向导部署最新代码（幂等，复用资源） */
update.post("/run", async (c) => {
  const body = await c.req.json<{ token?: string; accountId?: string }>().catch(() => null);

  const cfg = await getUpdateConfig(c.env);
  let token = body?.token?.trim() || null;
  if (!token && cfg.tokenEncrypted) {
    try {
      token = await decryptUpdateToken(c.env, cfg.tokenEncrypted);
    } catch {
      return c.json({ error: "已保存的更新 Token 已失效，请重新配置" }, 400);
    }
  }
  const accountId = body?.accountId?.trim() || cfg.accountId;
  if (!token || !accountId) {
    return c.json({ error: "缺少更新 Token 或账户，请先在设置页配置" }, 400);
  }
  if (!c.env.DEPLOYER_URL) {
    return c.json({ error: "未配置更新服务器（DEPLOYER_URL）" }, 500);
  }

  const res = await fetch(`${c.env.DEPLOYER_URL.replace(/\/+$/, "")}/api/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, accountId }),
  });
  const data = (await res.json().catch(() => null)) as { jobId?: string; error?: string } | null;
  if (!res.ok) {
    return c.json({ error: data?.error ?? "启动更新失败" }, 502);
  }
  return c.json({ jobId: data?.jobId, deployerUrl: c.env.DEPLOYER_URL });
});

/** 更新进度：代理到安装向导 */
update.get("/progress/:jobId", async (c) => {
  if (!c.env.DEPLOYER_URL) return c.json({ error: "未配置更新服务器" }, 500);
  const res = await fetch(`${c.env.DEPLOYER_URL.replace(/\/+$/, "")}/api/deploy/${c.req.param("jobId")}`);
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return c.json(data ?? { error: "查询进度失败" }, res.ok ? 200 : 502);
});

export default update;
