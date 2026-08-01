import { Hono } from "hono";
import type { Env } from "../env";
import { randomToken } from "../lib/id";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

/**
 * 附件暂存：写信时选中的附件先上传到 R2 staging，
 * 前端显示进度条，提交时用 token 引用。关闭写信框自动清理。
 */
const attachment = new Hono<AppContext>();
attachment.use("*", requireAuth);

/** 上传单个附件到 R2 暂存区，返回 token（用于提交/删除） */
attachment.post("/", async (c) => {
  const user = c.get("user");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "缺少文件" }, 400);
  if (file.size <= 0) return c.json({ error: "空文件" }, 400);
  if (file.size > 90 * 1024 * 1024) return c.json({ error: "文件过大（超过 90MB）" }, 413);

  const token = randomToken(24);
  const key = `staging/${user.id}/${token}/${file.name}`;
  await c.env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  return c.json({ token, filename: file.name, contentType: file.type, size: file.size });
});

/** 删除一个已暂存附件 */
attachment.delete("/:token", async (c) => {
  const user = c.get("user");
  const token = c.req.param("token");
  const listed = await c.env.R2.list({ prefix: `staging/${user.id}/${token}/` });
  if (listed.objects.length) await c.env.R2.delete(listed.objects.map((o) => o.key));
  return c.json({ ok: true });
});

/** 从暂存区读取附件内容（发送时用） */
export async function readStagedAttachment(
  env: Env,
  userId: string,
  token: string,
): Promise<{ key: string; content: ArrayBuffer; contentType: string; filename: string } | null> {
  const listed = await env.R2.list({ prefix: `staging/${userId}/${token}/` });
  const obj = listed.objects[0];
  if (!obj) return null;
  const data = await env.R2.get(obj.key);
  if (!data) return null;
  return {
    key: obj.key,
    content: await data.arrayBuffer(),
    contentType: data.httpMetadata?.contentType ?? "application/octet-stream",
    filename: obj.key.slice(obj.key.lastIndexOf("/") + 1),
  };
}

/** 发送成功后清理暂存区（成功/失败都应清） */
export async function clearStagedAttachments(env: Env, userId: string, tokens: string[]): Promise<void> {
  for (const token of tokens) {
    const listed = await env.R2.list({ prefix: `staging/${userId}/${token}/` });
    if (listed.objects.length) await env.R2.delete(listed.objects.map((o) => o.key));
  }
}
export default attachment;
