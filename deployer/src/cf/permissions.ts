/**
 * Token 权限体检：用只读请求实测 token 能否访问部署必需的核心资源。
 * 全部是 GET 只读探测，不会创建/修改任何东西。
 */
import { cfRequest, CfError } from "./client";

export interface PermissionCheck {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

async function probe(
  token: string,
  path: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    await cfRequest(token, path);
    return { ok: true };
  } catch (error) {
    if (error instanceof CfError && (error.status === 403 || error.status === 401)) {
      return { ok: false, detail: "无权限访问" };
    }
    return { ok: false, detail: error instanceof Error ? error.message : "请求失败" };
  }
}

/** 账户级权限探测（D1 / R2 / Workers） */
export async function checkAccountPermissions(token: string, accountId: string): Promise<PermissionCheck[]> {
  const [d1, r2, workers] = await Promise.all([
    probe(token, `/accounts/${accountId}/d1/database?per_page=1`),
    probe(token, `/accounts/${accountId}/r2/buckets?per_page=1`),
    probe(token, `/accounts/${accountId}/workers/scripts?per_page=1`),
  ]);

  return [
    { key: "d1", label: "D1 数据库", ...d1 },
    { key: "r2", label: "R2 存储", ...r2 },
    { key: "workers", label: "Workers 脚本", ...workers },
  ];
}

/** 区域级权限探测（Email Routing / 域名） */
export async function checkZonePermissions(
  token: string,
  accountId: string,
): Promise<PermissionCheck[]> {
  const zones = await probe(token, `/zones?account.id=${accountId}&per_page=1`);
  if (!zones.ok) {
    return [
      { key: "zone", label: "域名（Zone）读取", ...zones },
      { key: "email", label: "Email Routing", ok: false, detail: "未列出域名，无法验证" },
    ];
  }

  // 拿第一个域名做 Email Routing 只读探测
  try {
    const list = await cfRequest<Array<{ id: string }>>(
      token,
      `/zones?account.id=${accountId}&per_page=1`,
    );
    const zoneId = list[0]?.id;
    if (zoneId) {
      const email = await probe(token, `/zones/${zoneId}/email/routing`);
      return [
        { key: "zone", label: "域名（Zone）读取", ok: true },
        { key: "email", label: "Email Routing", ...email },
      ];
    }
  } catch {
    // 忽略，fallthrough
  }

  return [
    { key: "zone", label: "域名（Zone）读取", ok: true },
    { key: "email", label: "Email Routing", ok: true, detail: "账户下暂无域名，部署时选择域名后再验证" },
  ];
}
