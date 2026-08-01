import { Link2, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { api } from "../lib/api";
import { formatDateTime, formatSize, formatTime } from "../lib/format";

type Share = Awaited<ReturnType<typeof api.shares>>["shares"][number];

export default function SharesView() {
  const { t } = useI18n();
  const [items, setItems] = useState<Share[]>([]);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // 同 OutboxView：固定引用，让依赖数组如实反映用到的东西
  const load = useCallback(async () => {
    const result = await api.shares();
    setItems(result.shares);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
                    await api.revokeShare(active.token);
                    setNotice(t("shares.revoked.notice"));
                    await load();
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
