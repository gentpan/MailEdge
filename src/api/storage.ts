import { Hono } from "hono";
import {
  getOutboundRetentionDays,
  getStorageBackend,
  OUTBOUND_RETENTION_OPTIONS,
  type OutboundRetentionDays,
  type StorageBackend,
  saveOutboundRetentionDays,
  saveStorageBackend,
} from "../db/appSettings";
import { createObjectStorage } from "../storage";
import { requireAdmin, requireAuth } from "./auth";
import type { AppContext } from "./context";

const storage = new Hono<AppContext>();
storage.use("*", requireAuth);

/** 返回当前生效后端与可用绑定。读请求不会泄露任何 Cloudflare 凭据。 */
storage.get("/config", async (c) => {
  const configured = await getStorageBackend(c.env);
  const current = await createObjectStorage(c.env).catch(() => null);
  return c.json({
    backend: current?.backend ?? configured,
    configuredBackend: configured,
    r2Available: Boolean(c.env.R2),
    kvAvailable: Boolean(c.env.KV),
    outboundRetentionDays: await getOutboundRetentionDays(c.env),
    outboundRetentionOptions: OUTBOUND_RETENTION_OPTIONS,
  });
});

/** 对全局存储后端做选择，避免普通用户改变其他用户的附件存储位置。 */
storage.post("/config", requireAdmin, async (c) => {
  const body = await c.req.json<{ backend?: StorageBackend }>().catch(() => null);
  const backend = body?.backend;
  if (backend !== "r2" && backend !== "kv") return c.json({ error: "存储后端必须是 r2 或 kv" }, 400);
  if (backend === "r2" && !c.env.R2) return c.json({ error: "当前部署没有绑定 R2 bucket" }, 503);
  if (backend === "kv" && !c.env.KV) return c.json({ error: "当前部署没有绑定 KV namespace" }, 503);

  await saveStorageBackend(c.env, backend);
  return c.json({
    backend,
    configuredBackend: backend,
    r2Available: Boolean(c.env.R2),
    kvAvailable: Boolean(c.env.KV),
    outboundRetentionDays: await getOutboundRetentionDays(c.env),
    outboundRetentionOptions: OUTBOUND_RETENTION_OPTIONS,
  });
});

storage.post("/retention", requireAdmin, async (c) => {
  const body = await c.req.json<{ days?: number }>().catch(() => null);
  const days = body?.days;
  if (!Number.isInteger(days) || !OUTBOUND_RETENTION_OPTIONS.includes(days as OutboundRetentionDays)) {
    return c.json({ error: `保留时间必须是 ${OUTBOUND_RETENTION_OPTIONS.join("、")} 天之一` }, 400);
  }
  const outboundRetentionDays = await saveOutboundRetentionDays(c.env, days as number);
  return c.json({ outboundRetentionDays, outboundRetentionOptions: OUTBOUND_RETENTION_OPTIONS });
});

export default storage;
