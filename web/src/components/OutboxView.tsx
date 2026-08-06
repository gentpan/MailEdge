import { CheckCircle2, CircleAlert, Clock3, Loader2, RefreshCw, Search, Send } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import type { OutboundView } from "../lib/api";
import { api } from "../lib/api";
import { formatDateTime, formatTime, PROVIDER_LABELS } from "../lib/format";
import { useAsyncList } from "../lib/useAsyncList";
import SenderAvatar from "./SenderAvatar";

const BADGE: Record<string, string> = {
  sent: "badge--success",
  failed: "badge--error",
  deferred: "badge--warning",
  sending: "badge--warning",
  queued: "badge",
};

type OutboxFilter = "all" | "sent" | "pending" | "failed";

const PENDING_STATUSES = new Set(["queued", "sending", "deferred"]);

const OUTBOX_FILTERS: Array<{ key: OutboxFilter; icon: typeof Send }> = [
  { key: "all", icon: Send },
  { key: "sent", icon: CheckCircle2 },
  { key: "pending", icon: Clock3 },
  { key: "failed", icon: CircleAlert },
];

function groupByDay(items: OutboundView[]): Array<{ key: string; items: OutboundView[] }> {
  const groups = new Map<string, OutboundView[]>();
  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = Number.isNaN(date.getTime())
      ? "unknown"
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups, ([key, groupedItems]) => ({ key, items: groupedItems }));
}

function dayLabel(key: string, lang: "zh" | "en", t: (key: TranslationKey) => string): string {
  if (key === "unknown") return t("list.today");
  const [yearText, monthText, dayText] = key.split("-");
  const date = new Date(Number(yearText), Number(monthText), Number(dayText));
  if (Number.isNaN(date.getTime())) return t("list.today");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t("list.today");
  if (date.toDateString() === yesterday.toDateString()) return t("list.yesterday");
  return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function OutboxView() {
  const { lang, t } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OutboxFilter>("all");

  const fetchItems = useCallback(() => api.outbox().then((result) => result.messages), []);
  const { items, loading, loadError, load } = useAsyncList<OutboundView>(fetchItems);

  const active = items.find((item) => item.id === activeId) ?? null;
  const query = search.trim().toLocaleLowerCase();
  const statusCounts = useMemo(
    () => ({
      all: items.length,
      sent: items.filter((item) => item.status === "sent").length,
      pending: items.filter((item) => PENDING_STATUSES.has(item.status)).length,
      failed: items.filter((item) => item.status === "failed").length,
    }),
    [items],
  );
  const visibleItems = items.filter((item) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "sent" && item.status === "sent") ||
      (statusFilter === "pending" && PENDING_STATUSES.has(item.status)) ||
      (statusFilter === "failed" && item.status === "failed");
    if (!matchesStatus) return false;
    if (!query) return true;
    const recipients = item.to.map((address) => `${address.name ?? ""} ${address.email}`).join(" ");
    return `${item.subject} ${item.fromEmail} ${recipients}`.toLocaleLowerCase().includes(query);
  });
  const groups = groupByDay(visibleItems);

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
      <section className="list-pane outbox-pane">
        <div className="outbox-pane__header">
          <div className="outbox-pane__eyebrow">
            <Send size={14} aria-hidden="true" />
            <span>{t("outbox.eyebrow")}</span>
          </div>
          <div className="outbox-pane__heading">
            <h2 className="list-pane__heading">{t("outbox.title")}</h2>
            <span className="outbox-pane__count" title={t("outbox.title")}>
              {items.length}
            </span>
            <button
              className="btn btn--icon"
              type="button"
              aria-label={t("common.refresh")}
              onClick={() => void load()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <p className="outbox-pane__desc">{t("outbox.desc")}</p>
          <div className="list-pane__search">
            <Search size={16} />
            <input
              className="input"
              value={search}
              placeholder={t("list.search")}
              aria-label={t("list.search")}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="outbox-pane__filters" role="tablist" aria-label={t("outbox.title")}>
            {OUTBOX_FILTERS.map(({ key, icon: Icon }) => (
              <button
                className={`outbox-pane__filter${statusFilter === key ? " outbox-pane__filter--active" : ""}`}
                key={key}
                type="button"
                role="tab"
                aria-selected={statusFilter === key}
                onClick={() => setStatusFilter(key)}
              >
                <Icon size={13} aria-hidden="true" />
                <span>{t(`outbox.filter.${key}` as TranslationKey)}</span>
                <strong>{statusCounts[key]}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="list-pane__body">
          {loading && (
            <div className="empty">
              <Loader2 size={20} className="spin" />
              <p>{t("list.loading")}</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="empty">
              <p>{t("list.loadError")}</p>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => void load()}>
                {t("common.refresh")}
              </button>
            </div>
          )}

          {!loading && !loadError && !visibleItems.length && (
            <div className="empty">
              <Send size={32} />
              <p>{items.length ? t("outbox.noMatches") : t("outbox.empty")}</p>
            </div>
          )}

          {groups.map((group) => (
            <section className="outbox-group" key={group.key}>
              <h3 className="outbox-group__label">{dayLabel(group.key, lang, t)}</h3>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`outbox-row${activeId === item.id ? " outbox-row--active" : ""}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <SenderAvatar address={item.to[0] ?? { email: item.fromEmail }} />
                  <span className="outbox-row__content">
                    <span className="outbox-row__topline">
                      <span
                        className="outbox-row__recipient-cell"
                        title={item.to.map((address) => address.email).join("、")}
                      >
                        {item.to.map((address) => address.name || address.email).join("、") || "—"}
                      </span>
                      <time className="outbox-row__time" dateTime={item.createdAt}>
                        {formatTime(item.createdAt, lang === "zh" ? "zh-CN" : "en-US")}
                      </time>
                    </span>
                    <span className="outbox-row__subject" title={item.subject || t("detail.noSubject")}>
                      {item.subject || t("detail.noSubject")}
                    </span>
                    <span className="outbox-row__meta">
                      <span>
                        {item.providerType
                          ? (PROVIDER_LABELS[item.providerType] ?? item.providerType)
                          : t("outbox.channel")}
                      </span>
                      {item.attempts > 1 && <span>{t("outbox.attempts", { n: item.attempts })}</span>}
                    </span>
                  </span>
                  <span className={`outbox-row__status badge ${BADGE[item.status] ?? ""}`}>
                    {t(`status.${item.status}` as TranslationKey)}
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </section>

      <section className="detail-pane outbox-detail">
        {!active ? (
          <div className="empty outbox-detail__empty">
            <Send size={32} />
            <p>{t("outbox.pick")}</p>
          </div>
        ) : (
          <>
            <div className="detail-pane__toolbar outbox-detail__toolbar">
              <div className="outbox-detail__toolbar-title">
                <Send size={15} aria-hidden="true" />
                <span>{t("outbox.detail.eyebrow")}</span>
              </div>
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

            <div className="detail-pane__body outbox-detail__body">
              <header className="detail-header outbox-detail__header">
                <p className="outbox-detail__eyebrow">{t("outbox.detail.eyebrow")}</p>
                <h2 className="detail-header__subject">{active.subject || t("detail.noSubject")}</h2>
                <div className="outbox-detail__route">
                  <span className="outbox-detail__route-label">{active.fromEmail}</span>
                  <span className="outbox-detail__route-arrow" aria-hidden="true">
                    →
                  </span>
                  <span>{active.to.map((address) => address.email).join("、") || "—"}</span>
                </div>
              </header>

              {notice && <div className="alert alert--success outbox-detail__notice">{notice}</div>}

              <section className="outbox-detail__card">
                <div className="outbox-detail__card-heading">
                  <h3>{t("outbox.title")}</h3>
                  <span className={`badge ${BADGE[active.status] ?? ""}`}>
                    {t(`status.${active.status}` as TranslationKey)}
                  </span>
                </div>
                <div className="detail-list outbox-detail__metadata">
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
              </section>

              <section className="outbox-detail__card outbox-detail__timeline-card">
                <div className="outbox-detail__card-heading">
                  <div>
                    <h3>{t("outbox.chain")}</h3>
                    <p>{t("outbox.chain.desc")}</p>
                  </div>
                  <span className="outbox-detail__attempt-count">{active.attempts}</span>
                </div>

                <div className="timeline outbox-detail__timeline">
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
              </section>
            </div>
          </>
        )}
      </section>
    </>
  );
}
