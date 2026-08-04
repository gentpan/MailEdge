import { Hono } from "hono";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

const avatar = new Hono<AppContext>();
avatar.use("*", requireAuth);

// 只接受域名，禁止把这个接口变成任意 URL 代理。
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;

/**
 * 获取企业域名图标。浏览器只传 domain，不传完整邮箱；上游图标由 Worker 代理并缓存。
 * 没有图标时返回 404，由前端回退到首字母头像。
 */
avatar.get("/", async (c) => {
  const domain = normalizeDomain(c.req.query("domain"));
  if (!domain) return c.body(null, 404);

  const response = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
    headers: { Accept: "image/*" },
  });
  if (!response.ok || !response.body) return c.body(null, 404);

  const contentType = response.headers.get("content-type") ?? "image/x-icon";
  if (!contentType.toLowerCase().startsWith("image/")) return c.body(null, 404);

  c.header("Content-Type", contentType);
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return c.body(response.body);
});

function normalizeDomain(value: string | undefined): string | null {
  const domain = value?.trim().toLowerCase().replace(/\.$/, "");
  return domain && DOMAIN_PATTERN.test(domain) ? domain : null;
}

export default avatar;
