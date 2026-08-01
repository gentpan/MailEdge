import { Link2, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { formatDateTime, formatSize, formatTime } from "../lib/format";
import { useAsyncList } from "../lib/useAsyncList";

type Share = Awaited<ReturnType<typeof api.shares>>["shares"][number];

export default function SharesView() {
  const { t } = useI18n();
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchItems = useCallback(() => api.shares().then((result) => result.shares), []);
  const { items, loading, loadError, load } = useAsyncList<Share>(fetchItems);

  const active = items.find((item) => item.token === activeToken) ?? null;
  const expired = (share: Share) =>
    Boolean(share.expires_at && new Date(share.expires_at).getTime() < Date.now());

  return (
    <>
      <section className="list-pane">
        <div className="list-pane__header">
          <h3 className="list-pane__heading">{t("shares.title")}</h3>
          <button
            className="btn btn--icon"
            type="button"
            aria-label={t("common.refresh")}
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

          {!loading && loadError && (
            <div className="empty">
              <p>{t("list.loadError")}</p>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => void load()}>
                {t("common.refresh")}
              </button>
            </div>
          )}

          {!loading && !loadError && !items.length && (
            <div className="empty">
              <Link2 size={32} />
              <p>{t("shares.empty")}</p>
              <p className="text-xs">{t("shares.empty.hint")}</p>
            </div>
          )}

          {items.map((share) => (
            <button
              key={share.token}
              type="button"
              className={`record-row${activeToken === share.token ? " record-row--active" : ""}`}
              onClick={() => setActiveToken(share.token)}
            >
              <div className="record-row__top">
                <span className="record-row__title">{share.filename}</span>
                <span className="record-row__time">{formatTime(share.created_at)}</span>
              </div>
              <div className="record-row__meta">
                <span>{formatSize(share.size)}</span>
                <span>{t("shares.downloads", { n: share.downloads })}</span>
                {share.is_revoked === 1 && <span className="badge badge--error">{t("shares.revoked")}</span>}
                {share.is_revoked === 0 && expired(share) && (
                  <span className="badge badge--warning">{t("shares.expired")}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-pane">
        {!active ? (
          <div className="empty">
            <Link2 size={32} />
            <p>{t("shares.pick")}</p>
          </div>
        ) : (
          <div className="detail-pane__body">
            <header className="detail-header">
              <h2 className="detail-header__subject">{active.filename}</h2>
              <div className="detail-header__row text-xs">
                {formatSize(active.size)} · {t("shares.downloads", { n: active.downloads })}
              </div>
            </header>

            {notice && <div className="alert alert--success">{notice}</div>}

            <div className="detail-list">
              <div className="detail-list__row">
                <span className="detail-list__key">{t("shares.url")}</span>
                <span className="detail-list__value mono">/d/{active.token}</span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">{t("shares.message")}</span>
                <span className="detail-list__value mono">{active.message_id ?? "—"}</span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">{t("shares.createdAt")}</span>
                <span className="detail-list__value text-secondary">{formatDateTime(active.created_at)}</span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">{t("shares.expiresAt")}</span>
                <span className="detail-list__value text-secondary">
                  {active.expires_at ? formatDateTime(active.expires_at) : t("shares.forever")}
                </span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">{t("shares.status")}</span>
                <span className="detail-list__value">
                  {active.is_revoked === 1 ? (
                    <span className="badge badge--error">{t("shares.revoked")}</span>
                  ) : expired(active) ? (
                    <span className="badge badge--warning">{t("shares.expired")}</span>
                  ) : (
                    <span className="badge badge--success">{t("shares.downloadable")}</span>
                  )}
                </span>
              </div>
            </div>

            <div className="form-actions">
              <a className="btn btn--secondary" href={`/d/${active.token}`} target="_blank" rel="noreferrer">
                {t("shares.open")}
              </a>
              {active.is_revoked === 0 && (
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  onClick={async () => {
                    try {
                      await api.revokeShare(active.token);
                      setNotice(t("shares.revoked.notice"));
                      await load();
                    } catch {
                      setNotice(t("toast.actionFailed"));
                    }
                  }}
                >
                  {t("shares.revoke")}
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
