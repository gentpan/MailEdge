import { Chart } from "chart.js/auto";
import {
  BarChart3,
  CircleAlert,
  Clock3,
  Database,
  HardDrive,
  Mail,
  RefreshCw,
  Send,
  Server,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MailCategory } from "../../../src/ai/types";
import type { FolderStats } from "../../../src/shared/message";
import { useI18n } from "../i18n";
import type { OutboundView, ProviderView, UsageView } from "../lib/api";
import { api } from "../lib/api";

const CATEGORY_KEYS: MailCategory[] = [
  "important",
  "updates",
  "promotions",
  "verification",
  "social",
  "other",
];
const TREND_DAYS = 14;

function formatBytes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let index = -1;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

interface DashboardSnapshot {
  outbox: OutboundView[];
  stats: FolderStats[];
  categories: Record<MailCategory, number>;
  providers: ProviderView[];
  usage: UsageView;
  aiEnabled: boolean;
  loadedAt: string;
}

function emptyCategories(): Record<MailCategory, number> {
  return { important: 0, updates: 0, promotions: 0, verification: 0, social: 0, other: 0 };
}

function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date = new Date()): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function dateDaysAgo(days: number): Date {
  const date = startOfDay();
  date.setDate(date.getDate() - days);
  return date;
}

function statFor(stats: FolderStats[], folder: FolderStats["folder"]): FolderStats {
  return stats.find((item) => item.folder === folder) ?? { folder, total: 0, unread: 0 };
}

export default function DashboardView() {
  const { lang, t } = useI18n();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [themeDark, setThemeDark] = useState(() => document.body.classList.contains("theme-dark"));
  const trendCanvas = useRef<HTMLCanvasElement>(null);
  const categoryCanvas = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [outboxResult, statsResult, providersResult, aiResult, inboxResult, catchallResult, usageResult] =
        await Promise.all([
          api.outbox(),
          api.stats("all"),
          api.providers(),
          api.aiConfig(),
          api.messages({ mailboxId: "all", folder: "inbox", limit: 200 }),
          api.messages({ mailboxId: "all", folder: "catchall", limit: 200 }),
          api.usage(),
        ]);
      const categories = emptyCategories();
      for (const message of [...inboxResult.items, ...catchallResult.items]) {
        if (message.category && message.category in categories) {
          categories[message.category as MailCategory] += 1;
        }
      }
      setSnapshot({
        outbox: outboxResult.messages,
        stats: statsResult.stats,
        categories,
        providers: providersResult.providers,
        usage: usageResult,
        aiEnabled: aiResult.ai.enabled,
        loadedAt: new Date().toISOString(),
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 主题切换由 body class 驱动，监听它让 Chart.js 同步更新颜色。
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeDark(document.body.classList.contains("theme-dark")));
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const metrics = useMemo(() => {
    const outbox = snapshot?.outbox ?? [];
    const today = startOfDay();
    const thirtyDaysAgo = dateDaysAgo(30);
    const sent = outbox.filter((item) => item.status === "sent");
    const sentToday = sent.filter((item) => new Date(item.createdAt) >= today).length;
    const sent30Days = sent.filter((item) => new Date(item.createdAt) >= thirtyDaysAgo).length;
    const inbox = statFor(snapshot?.stats ?? [], "inbox");
    const catchall = statFor(snapshot?.stats ?? [], "catchall");
    return {
      sentTotal: sent.length,
      sentToday,
      sent30Days,
      inboundTotal: inbox.total + catchall.total,
      unread: inbox.unread + catchall.unread,
    };
  }, [snapshot]);

  const storageShares = useMemo(() => {
    const values = {
      d1: snapshot?.usage.d1.sizeBytes ?? 0,
      durableObjects: snapshot?.usage.durableObjects.sqliteBytes ?? 0,
      r2: snapshot?.usage.r2.available ? snapshot.usage.r2.bytes : 0,
    };
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return {
      d1: total ? Math.round((values.d1 / total) * 100) : 0,
      durableObjects: total ? Math.round((values.durableObjects / total) * 100) : 0,
      r2: total ? Math.round((values.r2 / total) * 100) : 0,
    };
  }, [snapshot]);

  useEffect(() => {
    if (loading || !snapshot || !trendCanvas.current || !categoryCanvas.current) return;
    const styles = getComputedStyle(document.body);
    const text =
      styles.getPropertyValue("--color-text-secondary").trim() || (themeDark ? "#d1d5db" : "#6b7280");
    const border = styles.getPropertyValue("--color-border").trim() || "#e5e7eb";
    const primary = styles.getPropertyValue("--color-primary").trim() || "#2563eb";
    const success = styles.getPropertyValue("--color-success").trim() || "#16a34a";
    const warning = styles.getPropertyValue("--color-warning").trim() || "#d97706";
    const errorColor = styles.getPropertyValue("--color-error").trim() || "#dc2626";
    const secondary = styles.getPropertyValue("--color-secondary").trim() || "#374151";
    const violet = styles.getPropertyValue("--color-avatar-violet").trim() || "#6d4aff";
    const labels: string[] = [];
    const values: number[] = [];
    for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
      const date = dateDaysAgo(offset);
      labels.push(
        date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }),
      );
      const key = dayKey(date.toISOString());
      values.push(
        snapshot.outbox.filter((item) => item.status === "sent" && dayKey(item.createdAt) === key).length,
      );
    }

    const categoryValues = CATEGORY_KEYS.map((key) => snapshot.categories[key]);
    const categoryTotal = categoryValues.reduce((sum, value) => sum + value, 0);
    const trendChart = new Chart(trendCanvas.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: t("dashboard.chart.sent"),
            data: values,
            borderColor: violet,
            backgroundColor: `${violet}26`,
            fill: true,
            tension: 0.35,
            pointRadius: 2.5,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: "easeOutQuart" },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: border }, ticks: { color: text, maxRotation: 0 } },
          y: { beginAtZero: true, grid: { color: border }, ticks: { color: text, precision: 0 } },
        },
      },
    });
    const categoryChart = new Chart(categoryCanvas.current, {
      type: "doughnut",
      data: {
        labels: CATEGORY_KEYS.map((key) => t(`cat.${key}`)),
        datasets: [
          {
            data: categoryTotal ? categoryValues : [1, 0, 0, 0, 0, 0],
            backgroundColor: categoryTotal
              ? [primary, success, warning, violet, secondary, errorColor]
              : [border, "transparent", "transparent", "transparent", "transparent", "transparent"],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: "easeOutQuart" },
        cutout: "68%",
        plugins: {
          legend: { position: "bottom", labels: { color: text, usePointStyle: true, padding: 16 } },
        },
      },
    });
    return () => {
      trendChart.destroy();
      categoryChart.destroy();
    };
  }, [lang, loading, snapshot, t, themeDark]);

  const currentMonthStart = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  return (
    <main className="dashboard-view">
      <div
        className={`dashboard-page ${loading ? "dashboard-page--loading" : "dashboard-page--ready"}`}
        aria-busy={loading}
      >
        <header className="dashboard-header">
          <div>
            <span className="eyebrow">{t("dashboard.eyebrow")}</span>
            <h1 className="dashboard-title">{t("dashboard.title")}</h1>
            <p className="dashboard-subtitle">{t("dashboard.desc")}</p>
          </div>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : undefined} />
            {t("common.refresh")}
          </button>
        </header>

        {error && (
          <div className="dashboard-notice dashboard-notice--error" role="alert">
            <CircleAlert size={17} />
            <span>{t("dashboard.loadError")}</span>
          </div>
        )}

        <section className="dashboard-metrics" aria-label={t("dashboard.metrics")}>
          <article className="dashboard-metric">
            <span className="dashboard-metric__icon dashboard-metric__icon--primary">
              <Send size={17} />
            </span>
            <span className="dashboard-metric__label">{t("dashboard.metric.sentToday")}</span>
            <strong>
              {loading ? (
                <span className="dashboard-skeleton dashboard-skeleton--metric" />
              ) : (
                metrics.sentToday.toLocaleString()
              )}
            </strong>
            <small>{t("dashboard.metric.sent30", { n: metrics.sent30Days })}</small>
          </article>
          <article className="dashboard-metric">
            <span className="dashboard-metric__icon dashboard-metric__icon--success">
              <Mail size={17} />
            </span>
            <span className="dashboard-metric__label">{t("dashboard.metric.inbound")}</span>
            <strong>
              {loading ? (
                <span className="dashboard-skeleton dashboard-skeleton--metric" />
              ) : (
                metrics.inboundTotal.toLocaleString()
              )}
            </strong>
            <small>{t("dashboard.metric.unread", { n: metrics.unread })}</small>
          </article>
          <article className="dashboard-metric">
            <span className="dashboard-metric__icon dashboard-metric__icon--violet">
              <Sparkles size={17} />
            </span>
            <span className="dashboard-metric__label">{t("dashboard.metric.aiTokens")}</span>
            <strong>
              {loading ? <span className="dashboard-skeleton dashboard-skeleton--metric" /> : "—"}
            </strong>
            <small>{snapshot?.aiEnabled ? t("dashboard.ai.pending") : t("dashboard.ai.disabled")}</small>
          </article>
          <article className="dashboard-metric">
            <span className="dashboard-metric__icon dashboard-metric__icon--warning">
              <Clock3 size={17} />
            </span>
            <span className="dashboard-metric__label">{t("dashboard.metric.totalSent")}</span>
            <strong>
              {loading ? (
                <span className="dashboard-skeleton dashboard-skeleton--metric" />
              ) : (
                metrics.sentTotal.toLocaleString()
              )}
            </strong>
            <small>{t("dashboard.metric.history")}</small>
          </article>
        </section>

        <section className="dashboard-resources" aria-label={t("dashboard.resources.title")}>
          <header className="dashboard-card__header">
            <div>
              <h2>{t("dashboard.resources.title")}</h2>
              <p>{t("dashboard.resources.desc")}</p>
            </div>
          </header>
          <div className="dashboard-resource-grid">
            <article className="dashboard-resource">
              <span className="dashboard-resource__icon dashboard-resource__icon--primary">
                <Database size={17} />
              </span>
              <div className="dashboard-resource__body">
                <strong>{t("dashboard.resources.d1")}</strong>
                <b>
                  {loading ? (
                    <span className="dashboard-skeleton dashboard-skeleton--resource" />
                  ) : (
                    formatBytes(snapshot?.usage.d1.sizeBytes ?? null)
                  )}
                </b>
                <small>{t("dashboard.resources.rows", { n: snapshot?.usage.d1.totalRows ?? 0 })}</small>
                <div className="dashboard-resource__progress" aria-hidden="true">
                  <span style={{ width: loading ? "34%" : `${storageShares.d1}%` }} />
                </div>
                <em>
                  {loading ? t("dashboard.loading") : t("dashboard.resources.share", { n: storageShares.d1 })}
                </em>
              </div>
            </article>
            <article className="dashboard-resource">
              <span className="dashboard-resource__icon dashboard-resource__icon--violet">
                <Server size={17} />
              </span>
              <div className="dashboard-resource__body">
                <strong>{t("dashboard.resources.durableObjects")}</strong>
                <b>
                  {loading ? (
                    <span className="dashboard-skeleton dashboard-skeleton--resource" />
                  ) : (
                    formatBytes(snapshot?.usage.durableObjects.sqliteBytes ?? null)
                  )}
                </b>
                <small>
                  {t("dashboard.resources.mailboxes", {
                    n: snapshot?.usage.durableObjects.mailboxCount ?? 0,
                    messages: snapshot?.usage.durableObjects.messageCount ?? 0,
                  })}
                </small>
                <div className="dashboard-resource__progress" aria-hidden="true">
                  <span style={{ width: loading ? "48%" : `${storageShares.durableObjects}%` }} />
                </div>
                <em>
                  {loading
                    ? t("dashboard.loading")
                    : t("dashboard.resources.share", { n: storageShares.durableObjects })}
                </em>
              </div>
            </article>
            <article className="dashboard-resource">
              <span className="dashboard-resource__icon dashboard-resource__icon--warning">
                <HardDrive size={17} />
              </span>
              <div className="dashboard-resource__body">
                <strong>{t("dashboard.resources.r2")}</strong>
                <b>
                  {loading ? (
                    <span className="dashboard-skeleton dashboard-skeleton--resource" />
                  ) : snapshot?.usage.r2.available ? (
                    formatBytes(snapshot.usage.r2.bytes)
                  ) : (
                    "—"
                  )}
                </b>
                <small>
                  {snapshot?.usage.r2.available
                    ? t("dashboard.resources.objects", { n: snapshot.usage.r2.objectCount })
                    : t("dashboard.resources.unavailable")}
                </small>
                <div className="dashboard-resource__progress" aria-hidden="true">
                  <span style={{ width: loading ? "26%" : `${storageShares.r2}%` }} />
                </div>
                <em>
                  {loading ? t("dashboard.loading") : t("dashboard.resources.share", { n: storageShares.r2 })}
                </em>
              </div>
            </article>
          </div>
          <p className="dashboard-resource-note">{t("dashboard.resources.note")}</p>
        </section>

        <section className="dashboard-chart-grid">
          <article className="dashboard-card dashboard-card--chart">
            <header className="dashboard-card__header">
              <div>
                <h2>{t("dashboard.chart.sentTitle")}</h2>
                <p>{t("dashboard.chart.sentDesc")}</p>
              </div>
              <BarChart3 size={19} />
            </header>
            <div className="dashboard-chart">
              {loading ? (
                <div className="dashboard-chart__loading" role="status">
                  <span className="dashboard-chart__loading-line" />
                  <span>{t("dashboard.chart.loading")}</span>
                </div>
              ) : (
                <canvas ref={trendCanvas} />
              )}
            </div>
          </article>
          <article className="dashboard-card dashboard-card--chart">
            <header className="dashboard-card__header">
              <div>
                <h2>{t("dashboard.chart.categoryTitle")}</h2>
                <p>{t("dashboard.chart.categoryDesc")}</p>
              </div>
              <Mail size={19} />
            </header>
            <div className="dashboard-chart dashboard-chart--donut">
              {loading ? (
                <div className="dashboard-chart__loading dashboard-chart__loading--donut" role="status">
                  <span className="dashboard-chart__loading-ring" />
                  <span>{t("dashboard.chart.loading")}</span>
                </div>
              ) : (
                <canvas ref={categoryCanvas} />
              )}
            </div>
          </article>
        </section>

        <section className="dashboard-card dashboard-card--quota">
          <header className="dashboard-card__header">
            <div>
              <h2>{t("dashboard.quota.title")}</h2>
              <p>{t("dashboard.quota.desc")}</p>
            </div>
          </header>
          <div className="dashboard-provider-grid">
            {loading ? (
              [0, 1, 2].map((item) => (
                <article className="dashboard-provider dashboard-provider--loading" key={item}>
                  <span className="dashboard-skeleton dashboard-skeleton--provider-title" />
                  <span className="dashboard-skeleton dashboard-skeleton--provider-meta" />
                  <span className="dashboard-skeleton dashboard-skeleton--provider-bar" />
                </article>
              ))
            ) : snapshot?.providers.length ? (
              snapshot.providers.map((provider) => {
                const used = snapshot.outbox.filter(
                  (item) =>
                    item.status === "sent" &&
                    item.providerType === provider.type &&
                    new Date(item.createdAt) >= currentMonthStart,
                ).length;
                return (
                  <article className="dashboard-provider" key={provider.id}>
                    <div className="dashboard-provider__top">
                      <strong>{provider.name}</strong>
                      <span className={`badge ${provider.isEnabled ? "badge--success" : ""}`}>
                        {provider.isEnabled ? t("providers.connected") : t("providers.disabled")}
                      </span>
                    </div>
                    <div className="dashboard-provider__usage">
                      <span>{t("dashboard.quota.used", { n: used })}</span>
                      <span>{t("dashboard.quota.limitUnknown")}</span>
                    </div>
                    <div
                      className="dashboard-provider__bar dashboard-provider__bar--unknown"
                      aria-hidden="true"
                    />
                  </article>
                );
              })
            ) : (
              <p className="dashboard-empty">{t("dashboard.quota.empty")}</p>
            )}
          </div>
        </section>

        <p className="dashboard-footnote">
          {t("dashboard.footnote", {
            time: snapshot
              ? new Date(snapshot.loadedAt).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US")
              : "—",
          })}
        </p>
      </div>
    </main>
  );
}
