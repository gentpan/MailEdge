/**
 * Token 权限体检：用只读请求实测 token 能否访问部署必需的核心资源。
 * 全部是 GET 只读探测，不会创建/修改任何东西。
 */
import { cfRequest, CfError } from "./client";

export interface PermissionCheck {
  key: string;
  label: string;
  ok: boolean;
  /** 非权限问题（如功能未启用）——前端显示为黄色提示而非红色错误 */
  warn?: boolean;
  detail?: string;
}

async function probe(
  token: string,
  path: string,
): Promise<{ ok: true } | { ok: false; status?: number; detail: string }> {
  try {
    await cfRequest(token, path);
    return { ok: true };
  } catch (error) {
    if (error instanceof CfError) {
      return { ok: false, status: error.status, detail: error.message };
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
    { key: "d1", label: "D1 数据库", ok: d1.ok },
    { key: "r2", label: "R2 存储", ok: r2.ok },
    { key: "workers", label: "Workers 脚本", ok: workers.ok },
  ];
}

/** 区域级权限探测（Email Routing / 域名） */
export async function checkZonePermissions(
  token: string,
  accountId: string,
): Promise<PermissionCheck[]> {
  const zones = await probe(token, `/zones?account.id=${accountId}&per_page=1`);
  if (!zones.ok) {
    const isPermission = zones.status === 403 || zones.status === 401;
    return [
      { key: "zone", label: "域名（Zone）读取", ok: !isPermission, warn: !isPermission, detail: zones.detail },
      { key: "email", label: "Email Routing", ok: false, warn: true, detail: "未列出域名，无法验证" },
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
      if (email.ok) {
        return [
          { key: "zone", label: "域名（Zone）读取", ok: true },
          { key: "email", label: "Email Routing", ok: true },
        ];
      }
      // Email Routing 未启用时端点会报错，但不代表 token 缺权限
      const isPermission = email.status === 403 || email.status === 401;
      return [
        { key: "zone", label: "域名（Zone）读取", ok: true },
        {
          key: "email",
          label: "Email Routing",
          ok: false,
          warn: !isPermission,
          detail: isPermission ? "Token 缺少 Email Routing 权限" : "尚未启用（部署时会自动启用）",
        },
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
