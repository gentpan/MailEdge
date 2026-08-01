/** Cloudflare REST API 客户端（v4）。所有调用都带用户提供的一次性 token。 */

const API_BASE = "https://api.cloudflare.com/client/v4";

import type { CfAccount, CfZone } from "../types";

export class CfError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly errors?: Array<{ code: number; message: string }>,
  ) {
    super(message);
    this.name = "CfError";
  }
}

interface CfEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
  result_info?: { total_count?: number };
}

/**
 * 底层请求。token 是用户提供的一次性 API Token，只在本请求内使用，不落库。
 * 默认 15 秒超时，避免某个 CF 请求挂起导致整个扫描/部署流程卡住。
 */
export async function cfRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    throw new CfError(
      error instanceof Error && error.name === "AbortError"
        ? "Cloudflare 请求超时，请重试"
        : `Cloudflare 请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  let envelope: CfEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as CfEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!envelope) {
    throw new CfError(`Cloudflare 返回了无法解析的响应（HTTP ${res.status}）`, res.status);
  }
  if (!envelope.success) {
    const detail = (envelope.errors ?? [])
      .map((e) => e.message)
      .filter(Boolean)
      .join("；");
    throw new CfError(detail || `Cloudflare 请求失败（HTTP ${res.status}）`, res.status, envelope.errors);
  }
  return envelope.result;
}

/** 校验 token 是否有效 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    await cfRequest(token, "/user/tokens/verify");
    return true;
  } catch {
    return false;
  }
}

/** token 有权限的账户列表 */
export async function listAccounts(token: string) {
  const result = await cfRequest<CfAccount[]>(token, "/accounts?per_page=50");
  return result;
}

/** 指定账户下的域名（用户托管在 Cloudflare 的 zone） */
export async function listZones(token: string, accountId: string) {
  const result = await cfRequest<CfZone[]>(
    token,
    `/zones?account.id=${accountId}&per_page=100&status=active`,
  );
  return result;
}

/** 在指定账户下查询 zone_id（按名称） */
export async function findZone(token: string, accountId: string, name: string) {
  const result = await cfRequest<CfZone[]>(
    token,
    `/zones?account.id=${accountId}&name=${encodeURIComponent(name)}`,
  );
  return result[0] ?? null;
}
