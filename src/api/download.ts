import { Hono } from "hono";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const download = new Hono<AppContext>();

interface LinkRow {
  token: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size: number;
  message_id: string | null;
  user_id: string | null;
  downloads: number;
  is_revoked: number;
  expires_at: string | null;
}

/**
 * 大附件的公开下载入口（智能附件生成的链接）。
 * 由 Worker 校验 token、有效期与撤销状态，再从 R2 出流。
 */
download.get("/d/:token", async (c) => {
  const row = await c.env.DB.prepare(`SELECT * FROM attachment_links WHERE token = ?`)
    .bind(c.req.param("token"))
    .first<LinkRow>();

  if (!row) return c.text("链接不存在", 404);
  if (row.is_revoked === 1) return c.text("链接已被撤销", 410);
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return c.text("链接已过期", 410);

  const object = await c.env.R2.get(row.r2_key);
  if (!object) return c.text("文件已被清理", 410);

  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE attachment_links SET downloads = downloads + 1 WHERE token = ?`)
      .bind(row.token)
      .run()
      .then(() => undefined),
  );

  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Length": row.size.toString(),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
});

/** 分享管理：查看下载次数、撤销链接 */
download.get("/api/shares", requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT token, filename, content_type, size, message_id, downloads, is_revoked, expires_at, created_at
     FROM attachment_links WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(c.get("user").id)
    .all();
  return c.json({ shares: results });
});

download.post("/api/shares/:token/revoke", requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`UPDATE attachment_links SET is_revoked = 1 WHERE token = ? AND user_id = ?`)
    .bind(c.req.param("token"), c.get("user").id)
    .run();
  if (!result.meta.changes) return c.json({ error: "链接不存在" }, 404);
  return c.json({ ok: true });
});

export default download;
