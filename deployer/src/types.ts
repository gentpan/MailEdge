/** Cloudflare API 相关类型 */

export interface CfAccount {
  id: string;
  name: string;
  type: string;
  settings?: Record<string, unknown>;
}

export interface CfZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
}

export interface VerifiedToken {
  id: string;
  status: string;
  expireTime?: string | null;
}

/** 一次部署的全部配置，由前端收集、后端执行 */
export interface DeployRequest {
  token: string;
  accountId: string;
  /** 用户域名（托管在 Cloudflare 上，用于 Email Routing 收信） */
  zoneName: string;
  zoneId: string;
  /** 收件地址的本地部分，如 support */
  catchAll: boolean;
  address: string;
  /** 是否生成随机管理员密码，还是让用户部署后初始化 */
  adminEmail: string;
  adminPassword: string;
  /** 部署类型：workers.dev 或自定义子域 */
}

export interface DeployStepResult {
  step: string;
  ok: boolean;
  detail?: string;
}
