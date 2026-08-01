import { Loader2, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import type { OutboundView } from "../lib/api";
import { api } from "../lib/api";
import { formatDateTime, formatTime, PROVIDER_LABELS } from "../lib/format";

const BADGE: Record<string, string> = {
  sent: "badge--success",
  failed: "badge--error",
  deferred: "badge--warning",
  sending: "badge--warning",
  queued: "badge",
};

export default function OutboxView() {
  const { t } = useI18n();
  const [items, setItems] = useState<OutboundView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 不依赖任何 props/state，用 useCallback 固定引用，
  // 这样 useEffect 能如实声明依赖而不会反复触发
  const load = useCallback(async () => {
    const result = await api.outbox();
    setItems(result.messages);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = items.find((item) => item.id === activeId) ?? null;

  async function retry(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      await api.retry(id);
      setNotice(t("detail.resent"));
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="list-pane">
        <div className="list-pane__header">
          <h3 className="list-pane__heading">{t("outbox.title")}</h3>
          <button
            className="btn btn--icon"
            type="button"
            aria-label={t("common.test")}
            onClick={() => void load()}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="list-pane__body">
          {loading && (
            <div className="empty">
              <Loader2 size={20} className="spin" />
              <p>{t("list.loading")}</p>
            </div>
          )}

          {!loading && !items.length && (
            <div className="empty">
              <Send size={32} />
              <p>{t("outbox.empty")}</p>
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
                <span className="record-row__title">{item.subject || t("detail.noSubject")}</span>
                <span className="record-row__time">{formatTime(item.createdAt)}</span>
              </div>
              <div className="record-row__meta">
                <span className={`badge ${BADGE[item.status] ?? ""}`}>
                  {t(`status.${item.status}` as TranslationKey)}
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
            <p>{t("outbox.pick")}</p>
          </div>
        ) : (
          <>
            <div className="detail-pane__toolbar">
              <span className={`badge ${BADGE[active.status] ?? ""}`}>
                {t(`status.${active.status}` as TranslationKey)}
              </span>
              <div className="detail-pane__toolbar-spacer" />
              {active.status !== "sent" && (
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  onClick={() => void retry(active.id)}
                  disabled={busy}
                >
                  {busy ? t("outbox.retry.busy") : t("outbox.retry")}
                </button>
              )}
            </div>

            <div className="detail-pane__body">
              <header className="detail-header">
                <h2 className="detail-header__subject">{active.subject || t("detail.noSubject")}</h2>
                <div className="detail-header__row text-xs">
                  {active.fromEmail} → {active.to.map((address) => address.email).join("、")}
                </div>
              </header>

              {notice && <div className="alert alert--success">{notice}</div>}

              <div className="detail-list">
                <div className="detail-list__row">
                  <span className="detail-list__key">{t("outbox.internalId")}</span>
                  <span className="detail-list__value mono">{active.id}</span>
                </div>
                <div className="detail-list__row">
                  <span className="detail-list__key">{t("outbox.channel")}</span>
                  <span className="detail-list__value">
                    {active.providerType
                      ? (PROVIDER_LABELS[active.providerType] ?? active.providerType)
                      : "—"}
                  </span>
                </div>
                {active.providerMessageId && (
                  <div className="detail-list__row">
                    <span className="detail-list__key">{t("outbox.receipt")}</span>
                    <span className="detail-list__value mono">{active.providerMessageId}</span>
                  </div>
                )}
                <div className="detail-list__row">
                  <span className="detail-list__key">{t("outbox.createdAt")}</span>
                  <span className="detail-list__value text-secondary">
                    {formatDateTime(active.createdAt)}
                  </span>
                </div>
                {active.nextRetryAt && (
                  <div className="detail-list__row">
                    <span className="detail-list__key">{t("outbox.nextRetry")}</span>
                    <span className="detail-list__value text-secondary">
                      {formatDateTime(active.nextRetryAt)}
                    </span>
                  </div>
                )}
              </div>

              <h3 className="section-title">{t("outbox.chain")}</h3>
              <p className="text-xs text-tertiary section-desc">{t("outbox.chain.desc")}</p>

              <div className="timeline">
                {active.attemptLog.map((attempt, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 尝试日志只追加不重排，同一毫秒的两条靠序号区分
                  <div className="timeline__item" key={`${attempt.at}-${index}`}>
                    <span
                      className={`timeline__dot ${attempt.success ? "timeline__dot--success" : "timeline__dot--error"}`}
                    />
                    <div className="timeline__body">
                      <div className="timeline__title">
                        <span>{PROVIDER_LABELS[attempt.providerType] ?? attempt.providerType}</span>
                        {attempt.success ? (
                          <span className="badge badge--success">{t("outbox.success")}</span>
                        ) : (
                          <span
                            className={`badge ${attempt.failureKind === "permanent" ? "badge--error" : "badge--warning"}`}
                          >
                            {attempt.failureKind === "permanent"
                              ? t("outbox.permanent")
                              : t("outbox.transient")}
                          </span>
                        )}
                        <span className="text-xs text-tertiary">{formatDateTime(attempt.at)}</span>
                      </div>
                      {attempt.error && <p className="timeline__desc">{attempt.error}</p>}
                      {!attempt.success && attempt.failureKind === "permanent" && (
                        <p className="timeline__desc">{t("outbox.permanent.desc")}</p>
                      )}
                      {!attempt.success && attempt.failureKind === "transient" && (
                        <p className="timeline__desc">{t("outbox.transient.desc")}</p>
                      )}
                    </div>
                  </div>
                ))}
                {!active.attemptLog.length && <p className="text-xs text-tertiary">{t("outbox.empty")}</p>}
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
