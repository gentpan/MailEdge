import type { MailProviderConfig } from "./types";

/**
 * 从发信服务商拉取「已验证的发信域名」。
 * 贴完 Key 点一下，就能把能用的域名同步回来，写信时据此约束发件人，
 * 避免选了未验证的地址发出去才被拒。
 */
export async function fetchVerifiedDomains(config: MailProviderConfig): Promise<string[]> {
  if (config.type === "resend") {
    return fetchResendDomains(config.apiKey);
  }
  if (config.type === "sendflare") {
    return fetchSendflareDomains(config.token, config.baseUrl);
  }
  // Cloudflare 原生发信的域名在 CF 面板管理、SMTP 发件人锁定在账号本身，都不适用自动拉取
  throw new DomainFetchError("该渠道不支持自动拉取域名");
}

export class DomainFetchError extends Error {}

async function fetchResendDomains(apiKey: string): Promise<string[]> {
  if (!apiKey) throw new DomainFetchError("请先填写并保存 API Key");

  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await res.json().catch(() => null)) as
    | { data?: Array<{ name?: string; status?: string }>; message?: string }
    | null;

  if (!res.ok) throw new DomainFetchError(data?.message ?? `Resend 请求失败（HTTP ${res.status}）`);

  // 只保留状态为 verified 的域名
  return (data?.data ?? [])
    .filter((item) => item.status === "verified" && item.name)
    .map((item) => item.name as string);
}

async function fetchSendflareDomains(token: string, baseUrl?: string): Promise<string[]> {
  if (!token) throw new DomainFetchError("请先填写并保存 API Token");

  const base = (baseUrl ?? "https://api.sendflare.com").replace(/\/+$/, "");
  const res = await fetch(`${base}/domains`, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json().catch(() => null)) as
    | { data?: unknown; domains?: unknown; message?: string }
    | null;

  if (!res.ok) throw new DomainFetchError(data?.message ?? `Sendflare 请求失败（HTTP ${res.status}）`);

  // Sendflare 的返回结构以其 API 为准，这里兼容常见几种形态
  const list = (Array.isArray(data?.data) ? data?.data : Array.isArray(data?.domains) ? data?.domains : []) as unknown[];
  return list
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as { name?: unknown; domain?: unknown; status?: unknown };
        if (record.status && record.status !== "verified" && record.status !== "active") return null;
        return (typeof record.name === "string" ? record.name : typeof record.domain === "string" ? record.domain : null);
      }
      return null;
    })
    .filter((name): name is string => Boolean(name));
}
