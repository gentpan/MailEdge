import { useEffect, useState } from "react";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime, formatSize, formatTime } from "../lib/format";

type Share = Awaited<ReturnType<typeof api.shares>>["shares"][number];

export default function SharesView() {
  const [items, setItems] = useState<Share[]>([]);
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const result = await api.shares();
    setItems(result.shares);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const active = items.find((item) => item.token === activeToken) ?? null;
  const expired = (share: Share) =>
    Boolean(share.expires_at && new Date(share.expires_at).getTime() < Date.now());

  return (
    <>
      <section className="list-pane">
        <div className="list-pane__header">
          <h3 className="list-pane__heading">附件链接</h3>
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
              <Link2 size={32} />
              <p>还没有生成过下载链接</p>
              <p className="text-xs">发送超过阈值的附件时会自动生成</p>
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
                <span>下载 {share.downloads} 次</span>
                {share.is_revoked === 1 && <span className="badge badge--error">已撤销</span>}
                {share.is_revoked === 0 && expired(share) && <span className="badge badge--warning">已过期</span>}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="detail-pane">
        {!active ? (
          <div className="empty">
            <Link2 size={32} />
            <p>选择一个文件查看分享详情</p>
          </div>
        ) : (
          <div className="detail-pane__body">
            <header className="detail-header">
              <h2 className="detail-header__subject">{active.filename}</h2>
              <div className="detail-header__row text-xs">
                {formatSize(active.size)} · 已下载 {active.downloads} 次
              </div>
            </header>

            {notice && <div className="alert alert--success">{notice}</div>}

            <div className="detail-list">
              <div className="detail-list__row">
                <span className="detail-list__key">下载地址</span>
                <span className="detail-list__value mono">/d/{active.token}</span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">所属邮件</span>
                <span className="detail-list__value mono">{active.message_id ?? "—"}</span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">创建时间</span>
                <span className="detail-list__value text-secondary">{formatDateTime(active.created_at)}</span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">过期时间</span>
                <span className="detail-list__value text-secondary">
                  {active.expires_at ? formatDateTime(active.expires_at) : "永久有效"}
                </span>
              </div>
              <div className="detail-list__row">
                <span className="detail-list__key">状态</span>
                <span className="detail-list__value">
                  {active.is_revoked === 1 ? (
                    <span className="badge badge--error">已撤销</span>
                  ) : expired(active) ? (
                    <span className="badge badge--warning">已过期</span>
                  ) : (
                    <span className="badge badge--success">可下载</span>
                  )}
                </span>
              </div>
            </div>

            <div className="form-actions">
              <a className="btn btn--secondary" href={`/d/${active.token}`} target="_blank" rel="noreferrer">
                打开链接
              </a>
              {active.is_revoked === 0 && (
                <button
                  className="btn btn--danger btn--sm"
                  type="button"
                  onClick={async () => {
                    await api.revokeShare(active.token);
                    setNotice("链接已撤销，再次访问会返回 410");
                    await load();
                  }}
                >
                  撤销链接
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
