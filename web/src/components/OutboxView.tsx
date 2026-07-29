import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { api } from "../lib/api";
import type { OutboundView } from "../lib/api";
import { PROVIDER_LABELS, STATUS_LABELS, formatDateTime, formatTime } from "../lib/format";

const BADGE: Record<string, string> = {
  sent: "badge--success",
  failed: "badge--error",
  deferred: "badge--warning",
  sending: "badge--warning",
  queued: "badge",
};

export default function OutboxView() {
  const [items, setItems] = useState<OutboundView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const result = await api.outbox();
    setItems(result.messages);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const active = items.find((item) => item.id === activeId) ?? null;

  async function retry(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api.retry(id);
      setNotice("已重新投递");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重试失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="list-pane">
        <div className="list-pane__header">
          <h3 className="list-pane__heading">发信记录</h3>
          <button className="btn btn--icon" type="button" aria-label="刷新" onClick={() => void load()}>
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="list-pane__body">
          {loading && (
            <div className="empty">
              <Loader2 size={20} className="spin" />
              <p>加载中…</p>
            </div>
          )}

          {!loading && !items.length && (
            <div className="empty">
              <Send size={32} />
              <p>还没有发过邮件</p>
            </div>
          )}

          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`record-row${activeId === item.id ? " record-row--active" : ""}`}
              onClick={() => setActiveId(item.id)}
            >
              <div className="record-row__top">
                <span className="record-row__title">{item.subject || "(无主题)"}</span>
                <span className="record-row__time">{formatTime(item.createdAt)}</span>
              </div>
              <div className="record-row__meta">
                <span className={`badge ${BADGE[item.status] ?? ""}`}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
                <span>{item.to.map((address) => address.email).join("、")}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-pane">
        {!active ? (
          <div className="empty">
            <Send size={32} />
            <p>选择一条记录查看投递链路</p>
          </div>
        ) : (
          <>
            <div className="detail-pane__toolbar">
              <span className={`badge ${BADGE[active.status] ?? ""}`}>
                {STATUS_LABELS[active.status] ?? active.status}
              </span>
              <div className="detail-pane__toolbar-spacer" />
              {active.status !== "sent" && (
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  onClick={() => void retry(active.id)}
                  disabled={busy}
                >
                  {busy ? "重试中…" : "重新投递"}
                </button>
              )}
            </div>

            <div className="detail-pane__body">
              <header className="detail-header">
                <h2 className="detail-header__subject">{active.subject || "(无主题)"}</h2>
                <div className="detail-header__row text-xs">
                  {active.fromEmail} → {active.to.map((address) => address.email).join("、")}
                </div>
              </header>

              {notice && <div className="alert alert--success">{notice}</div>}

              <div className="detail-list">
                <div className="detail-list__row">
                  <span className="detail-list__key">内部 ID</span>
                  <span className="detail-list__value mono">{active.id}</span>
                </div>
                <div className="detail-list__row">
                  <span className="detail-list__key">投递渠道</span>
                  <span className="detail-list__value">
                    {active.providerType
                      ? (PROVIDER_LABELS[active.providerType] ?? active.providerType)
                      : "—"}
                  </span>
                </div>
                {active.providerMessageId && (
                  <div className="detail-list__row">
                    <span className="detail-list__key">渠道回执</span>
                    <span className="detail-list__value mono">{active.providerMessageId}</span>
                  </div>
                )}
                <div className="detail-list__row">
                  <span className="detail-list__key">创建时间</span>
                  <span className="detail-list__value text-secondary">{formatDateTime(active.createdAt)}</span>
                </div>
                {active.nextRetryAt && (
                  <div className="detail-list__row">
                    <span className="detail-list__key">下次重试</span>
                    <span className="detail-list__value text-secondary">
                      {formatDateTime(active.nextRetryAt)}
                    </span>
                  </div>
                )}
              </div>

              <h3 className="section-title">投递链路</h3>
              <p className="text-xs text-tertiary section-desc">
                切换渠道时沿用同一个内部 ID，收件方与日志都能靠它去重。
              </p>

              <div className="timeline">
                {active.attemptLog.map((attempt, index) => (
                  <div className="timeline__item" key={`${attempt.at}-${index}`}>
                    <span
                      className={`timeline__dot ${attempt.success ? "timeline__dot--success" : "timeline__dot--error"}`}
                    />
                    <div className="timeline__body">
                      <div className="timeline__title">
                        <span>{PROVIDER_LABELS[attempt.providerType] ?? attempt.providerType}</span>
                        {attempt.success ? (
                          <span className="badge badge--success">成功</span>
                        ) : (
                          <span className={`badge ${attempt.failureKind === "permanent" ? "badge--error" : "badge--warning"}`}>
                            {attempt.failureKind === "permanent" ? "永久失败" : "临时失败"}
                          </span>
                        )}
                        <span className="text-xs text-tertiary">{formatDateTime(attempt.at)}</span>
                      </div>
                      {attempt.error && <p className="timeline__desc">{attempt.error}</p>}
                      {!attempt.success && attempt.failureKind === "permanent" && (
                        <p className="timeline__desc">永久性错误，已停止切换备用渠道。</p>
                      )}
                      {!attempt.success && attempt.failureKind === "transient" && (
                        <p className="timeline__desc">临时性错误，继续尝试下一个渠道。</p>
                      )}
                    </div>
                  </div>
                ))}
                {!active.attemptLog.length && <p className="text-xs text-tertiary">尚未产生投递记录</p>}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
