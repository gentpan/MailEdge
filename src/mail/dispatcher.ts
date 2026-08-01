import { deletePayload, getOutbound, updateOutbound } from "../db/outbound";
import { getSendChain, recordProviderHealth } from "../db/providers";
import type { Env } from "../env";
import { createMailProvider } from "./factory";
import type { MailProviderRecord, SendAttempt, SendMailInput, SendMailResult } from "./types";

const MAX_ATTEMPTS = 5;
const BASE_RETRY_MS = 5 * 60 * 1000;
const MAX_RETRY_MS = 6 * 60 * 60 * 1000;

export interface DispatchResult extends SendMailResult {
  internalId: string;
  status: "sent" | "deferred" | "failed";
  attempts: SendAttempt[];
}

/**
 * 状态流转：queued → sending → sent / deferred（延迟重试）/ failed。
 *
 * 切换备用渠道的唯一条件是 transient 错误（网络故障、429、5xx、渠道不可用）。
 * permanent 错误（域名未验证、地址非法、内容被拒、账户暂停、无发件权限）
 * 立即置 failed，绝不换渠道重发，避免同一封邮件在多个平台各发一次。
 */
export async function dispatch(
  env: Env,
  params: {
    internalId: string;
    input: SendMailInput;
    preferredProviderId?: string;
  },
): Promise<DispatchResult> {
  const { internalId, input } = params;

  const existing = await getOutbound(env, internalId);
  const attempts: SendAttempt[] = existing?.attemptLog ?? [];
  const attemptCount = existing?.attempts ?? 0;

  const chain = await getSendChain(env, params.preferredProviderId);
  if (!chain.length) {
    const error = "没有可用的发信渠道，请先在「设置 → 发信服务」中配置并启用";
    await updateOutbound(env, internalId, { status: "failed", lastError: error, attemptLog: attempts });
    return { internalId, status: "failed", success: false, provider: "cloudflare", error, attempts };
  }

  // 同一封邮件跨渠道沿用同一个内部 ID，便于收件方与日志去重
  const enriched: SendMailInput = {
    ...input,
    headers: { ...input.headers, "X-App-Message-ID": internalId },
  };

  let lastResult: SendMailResult | null = null;

  for (const [index, provider] of chain.entries()) {
    const result = await sendWith(env, provider, enriched, internalId);
    lastResult = result;

    attempts.push({
      providerId: provider.id,
      providerType: provider.type,
      at: new Date().toISOString(),
      success: result.success,
      error: result.error,
      failureKind: result.failureKind,
    });

    // 本次尝试的累计数（含历史），用于上限判断与退避计算
    const totalAttempts = attemptCount + index + 1;

    if (result.success) {
      await recordProviderHealth(env, provider.id, null);
      await updateOutbound(env, internalId, {
        status: "sent",
        providerId: provider.id,
        providerType: provider.type,
        providerMessageId: result.providerMessageId ?? null,
        lastError: null,
        nextRetryAt: null,
        incrementAttempts: true,
        attemptLog: attempts,
      });
      await deletePayload(env, existing?.payloadKey ?? null).catch(() => undefined);
      return { ...result, internalId, status: "sent", attempts };
    }

    await recordProviderHealth(env, provider.id, result.error ?? "未知错误");

    // 非终态也把尝试记录落库，避免中途崩溃后计数与日志漂移
    await updateOutbound(env, internalId, {
      status: "sending",
      providerId: provider.id,
      providerType: provider.type,
      incrementAttempts: true,
      attemptLog: attempts,
    });

    if (result.failureKind === "permanent") {
      await updateOutbound(env, internalId, {
        status: "failed",
        lastError: result.error ?? "发送失败",
        nextRetryAt: null,
        attemptLog: attempts,
      });
      return { ...result, internalId, status: "failed", attempts };
    }

    // 达到总尝试上限：即使还有备用渠道也不再发
    if (totalAttempts >= MAX_ATTEMPTS) {
      const error = result.error ?? "渠道暂时不可用";
      await updateOutbound(env, internalId, {
        status: "failed",
        lastError: `重试 ${totalAttempts} 次后仍失败：${error}`,
        nextRetryAt: null,
        attemptLog: attempts,
      });
      return { internalId, status: "failed", success: false, provider: result.provider, error, attempts };
    }

    // transient 且有备用渠道：换下一个
    const hasFallback = index < chain.length - 1;
    if (hasFallback) continue;

    // 所有渠道都是临时性失败 → 延迟重试（指数退避）
    const nextRetryAt = new Date(Date.now() + backoffMs(totalAttempts)).toISOString();
    await updateOutbound(env, internalId, {
      status: "deferred",
      lastError: result.error ?? "渠道暂时不可用",
      nextRetryAt,
      attemptLog: attempts,
    });

    return {
      internalId,
      status: "deferred",
      success: false,
      provider: result.provider,
      error: result.error,
      attempts,
    };
  }

  // 理论到不了这里：循环内每条路径都已 return
  return {
    internalId,
    status: "failed",
    success: false,
    provider: lastResult?.provider ?? "cloudflare",
    error: "所有发信渠道均不可用",
    attempts,
  };
}

async function sendWith(
  env: Env,
  record: MailProviderRecord,
  input: SendMailInput,
  internalId: string,
): Promise<SendMailResult> {
  try {
    const provider = createMailProvider(env, record.config, internalId);
    return await provider.send(input);
  } catch (error) {
    return {
      provider: record.type,
      success: false,
      error: error instanceof Error ? error.message : "渠道初始化失败",
      failureKind: "permanent",
    };
  }
}

function backoffMs(attempt: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1), MAX_RETRY_MS);
}
