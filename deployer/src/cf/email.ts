/**
 * Email Routing：启用收信并把来信转发到部署的 Worker。
 * 使用用户 token，在用户的 zone 上操作。
 */
import { cfRequest, CfError } from "./client";

export interface EmailRoutingStatus {
  enabled: boolean;
  tag?: string;
}

/** 查询 zone 的 Email Routing 状态 */
export async function getEmailRoutingStatus(token: string, zoneId: string): Promise<EmailRoutingStatus> {
  const result = await cfRequest<{ enabled: boolean; tag?: string }>(
    token,
    `/zones/${zoneId}/email/routing`,
  );
  return { enabled: Boolean(result.enabled), tag: result.tag };
}

/** 启用 Email Routing（会自动添加 MX/SPF 记录所需的 DNS 操作） */
export async function enableEmailRouting(token: string, zoneId: string): Promise<void> {
  await cfRequest(token, `/zones/${zoneId}/email/routing/enable`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface RoutingRule {
  matchers: Array<{ field?: string; type: "all" | "literal"; value?: string }>;
  actions: Array<{ type: "send_to_worker"; worker: string }>;
}

/**
 * 设置路由规则（覆盖式：PUT 会替换该 zone 的全部规则）。
 * 精确地址或 catch-all 二选一。
 */
export async function putRoutingRules(
  token: string,
  zoneId: string,
  workerName: string,
  options: { address?: string; catchAll: boolean },
): Promise<void> {
  const matchers = options.catchAll
    ? [{ type: "all" as const }]
    : [{ field: "to", type: "literal" as const, value: options.address }];

  await cfRequest(token, `/zones/${zoneId}/email/routing/rules`, {
    method: "PUT",
    body: JSON.stringify({
      rules: [{ matchers, actions: [{ type: "send_to_worker", worker: workerName }] }],
    }),
  });
}

/** 一键完成「检查 → 启用（若未开）→ 建规则」 */
export async function configureEmailRouting(
  token: string,
  zoneId: string,
  workerName: string,
  options: { address?: string; catchAll: boolean },
): Promise<void> {
  const status = await getEmailRoutingStatus(token, zoneId);
  if (!status.enabled) {
    try {
      await enableEmailRouting(token, zoneId);
    } catch (error) {
      const detail = error instanceof CfError ? error.message : String(error);
      throw new Error(`启用 Email Routing 失败（${detail}）。可先到面板手动启用后再重试。`);
    }
  }
  await putRoutingRules(token, zoneId, workerName, options);
}
