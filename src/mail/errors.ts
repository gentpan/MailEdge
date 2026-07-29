import type { FailureKind } from "./types";

/**
 * 只有 transient 才允许重试或切换备用 Provider。
 * 域名未验证、地址非法、内容被拒、账户被暂停这类错误一律 permanent，
 * 否则同一封被拒的邮件会在三个平台各发一次。
 */

const PERMANENT_PATTERNS = [
  /not\s+verified/i,
  /domain\s+.*(not|isn't)\s+verified/i,
  /unverified/i,
  /invalid\s+(email|recipient|address|from|sender)/i,
  /malformed/i,
  /not\s+allowed/i,
  /no\s+permission/i,
  /unauthorized/i,
  /forbidden/i,
  /suspended/i,
  /blocked/i,
  /blocklist/i,
  /spam/i,
  /complaint/i,
  /rejected/i,
  /content\s+.*(reject|violat)/i,
  /exceeds?\s+.*size/i,
  /too\s+large/i,
  /destination\s+address\s+not\s+allowed/i,
  /域名.*未验证/,
  /地址.*不合法/,
];

const TRANSIENT_PATTERNS = [
  /rate\s*limit/i,
  /too\s+many\s+requests/i,
  /timeout/i,
  /timed\s+out/i,
  /temporar/i,
  /try\s+again/i,
  /unavailable/i,
  /connection/i,
  /network/i,
  /socket/i,
];

export function classifyHttpFailure(status: number, message: string): FailureKind {
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "transient";
  if (status >= 400) {
    // 4xx 默认永久失败，除非报文明确表示是临时问题
    return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message)) ? "transient" : "permanent";
  }
  return "transient";
}

export function classifyThrown(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(message))) return "permanent";
  // fetch 抛出、DNS、断连等网络层错误都算临时
  return "transient";
}

export function classifyMessage(message: string, fallback: FailureKind = "transient"): FailureKind {
  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(message))) return "permanent";
  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) return "transient";
  return fallback;
}

export function errorMessage(error: unknown, fallback = "发送失败"): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error) return error;
  return fallback;
}
