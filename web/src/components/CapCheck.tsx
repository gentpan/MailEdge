import { Check, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { solveCapChallenge } from "../lib/capSolve";

export type CapState = "idle" | "solving" | "done" | "error";

export interface CapControl {
  state: CapState;
  progress: number;
  /** 拿通行证：已经有就直接给，正在算就等它，否则现在开始算。失败返回 null */
  start: () => Promise<string | null>;
  /** 通行证用掉了（登录试过一次，不管成败服务端都作废了），回到没勾选 */
  reset: () => void;
}

/**
 * Cap 人机验证（独立版登录用）：取一组题 → 后台线程算 → 交答案换一次性通行证。
 * 服务端规则见 MailEdge-V2 的 src/guard.ts。
 */
export function useCap(): CapControl {
  const [state, setState] = useState<CapState>("idle");
  const [progress, setProgress] = useState(0);
  const token = useRef<string | null>(null);
  const running = useRef<Promise<string | null> | null>(null);

  const start = useCallback(() => {
    if (token.current) return Promise.resolve(token.current);
    if (running.current) return running.current;
    setState("solving");
    setProgress(0);
    const job = (async () => {
      try {
        const challenge = await api.capChallenge();
        const solutions = await solveCapChallenge(challenge.items, setProgress);
        const result = await api.capRedeem({ id: challenge.id, solutions });
        token.current = result.token;
        setState("done");
        return result.token;
      } catch {
        setState("error");
        return null;
      } finally {
        running.current = null;
      }
    })();
    running.current = job;
    return job;
  }, []);

  const reset = useCallback(() => {
    token.current = null;
    setState("idle");
    setProgress(0);
  }, []);

  return { state, progress, start, reset };
}

export default function CapCheck({ cap }: { cap: CapControl }) {
  const { t } = useI18n();
  const { state, progress } = cap;
  const label =
    state === "solving"
      ? t("auth.cap.solving", { percent: Math.round(progress * 100) })
      : state === "done"
        ? t("auth.cap.done")
        : state === "error"
          ? t("auth.cap.retry")
          : t("auth.cap.label");

  return (
    <button
      className={`cap-check cap-check--${state}`}
      type="button"
      aria-pressed={state === "done"}
      aria-busy={state === "solving"}
      disabled={state === "solving" || state === "done"}
      onClick={() => void cap.start()}
    >
      <span className="cap-check__box" aria-hidden="true">
        {state === "solving" ? (
          <Loader2 size={14} className="spin" />
        ) : state === "done" ? (
          <Check size={14} strokeWidth={3} />
        ) : null}
      </span>
      <span className="cap-check__label" aria-live="polite">
        {label}
      </span>
      <span className="cap-check__meta">{t("auth.cap.meta")}</span>
    </button>
  );
}
