import { Download, FileText, Loader2, MailPlus, Paperclip, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../../i18n";
import type { ManagedAttachmentRef, ManagedAttachmentView } from "../../lib/api";
import { api } from "../../lib/api";
import { formatDateTime, formatSize } from "../../lib/format";

function itemKey(item: ManagedAttachmentView): string {
  return `${item.source}:${item.id}`;
}

function attachmentRef(item: ManagedAttachmentView): ManagedAttachmentRef | null {
  if (item.source === "share" && item.token) return { source: "share", token: item.token };
  if (item.source === "message" && item.mailboxId && item.messageId) {
    return {
      source: "message",
      mailboxId: item.mailboxId,
      messageId: item.messageId,
      attachmentId: item.id,
    };
  }
  return null;
}

export default function AttachmentPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<ManagedAttachmentView[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"delete" | "insert" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.attachments();
      setItems(result.attachments);
      setActiveKey((current) =>
        current && result.attachments.some((item) => itemKey(item) === current)
          ? current
          : result.attachments[0]
            ? itemKey(result.attachments[0])
            : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("attachments.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const active = useMemo(() => items.find((item) => itemKey(item) === activeKey) ?? null, [activeKey, items]);

  async function deleteActive() {
    if (!active || !window.confirm(t("attachments.delete.confirm"))) return;
    const ref = attachmentRef(active);
    if (!ref) return;
    setBusy("delete");
    setError(null);
    try {
      await api.deleteManagedAttachment(ref);
      const next = items.filter((item) => itemKey(item) !== itemKey(active));
      setItems(next);
      setActiveKey(next[0] ? itemKey(next[0]) : null);
      setNotice(t("attachments.deleted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("toast.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function insertActive() {
    if (!active || active.expired || active.revoked) return;
    const ref = attachmentRef(active);
    if (!ref) return;
    setBusy("insert");
    setError(null);
    try {
      const staged = await api.stageAttachment(ref);
      navigate("/", { state: { composeStagedAttachment: staged } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("toast.actionFailed"));
      setBusy(null);
    }
  }

  return (
    <div className="settings-panel settings-panel--wide">
      <header className="panel-head panel-head--split">
        <div>
          <h1 className="panel-head__title">{t("attachments.title")}</h1>
          <p className="panel-head__desc">{t("attachments.desc")}</p>
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

      {error && <div className="alert alert--error">{error}</div>}
      {notice && <div className="alert alert--success">{notice}</div>}

      {loading ? (
        <div className="empty attachment-manager__empty">
          <Loader2 size={20} className="spin" />
          <p>{t("attachments.loading")}</p>
        </div>
      ) : !items.length ? (
        <div className="empty attachment-manager__empty">
          <Paperclip size={24} />
          <p>{t("attachments.empty")}</p>
        </div>
      ) : (
        <div className="attachment-manager">
          <section className="attachment-manager__list" aria-label={t("attachments.title")}>
            <div className="attachment-manager__list-head">
              <span>{t("attachments.count", { n: items.length })}</span>
            </div>
            <div className="attachment-manager__list-scroll">
              {items.map((item) => (
                <button
                  className={`attachment-manager__item${itemKey(item) === activeKey ? " attachment-manager__item--active" : ""}`}
                  type="button"
                  key={itemKey(item)}
                  onClick={() => setActiveKey(itemKey(item))}
                >
                  <span className="attachment-manager__item-icon">
                    <FileText size={16} />
                  </span>
                  <span className="attachment-manager__item-main">
                    <strong className="attachment-manager__item-name" title={item.filename}>
                      {item.filename}
                    </strong>
                    <span className="attachment-manager__item-meta">
                      {formatSize(item.size)} · {formatDateTime(item.uploadedAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {active && (
            <section className="attachment-manager__detail">
              <div className="attachment-manager__detail-head">
                <div className="attachment-manager__detail-title-wrap">
                  <span className="attachment-manager__detail-icon">
                    <Paperclip size={18} />
                  </span>
                  <div>
                    <h2 title={active.filename}>{active.filename}</h2>
                    <p>
                      {formatSize(active.size)} · {active.contentType || "application/octet-stream"}
                    </p>
                  </div>
                </div>
                <span className="badge">
                  {active.source === "share"
                    ? t("attachments.share")
                    : active.direction === "inbound"
                      ? t("attachments.inbound")
                      : t("attachments.outbound")}
                </span>
              </div>

              <dl className="attachment-manager__meta">
                <div>
                  <dt>{t("attachments.uploadedAt")}</dt>
                  <dd>{formatDateTime(active.uploadedAt)}</dd>
                </div>
                <div>
                  <dt>{t("attachments.source")}</dt>
                  <dd>
                    {active.source === "share"
                      ? t("attachments.share")
                      : active.direction === "inbound"
                        ? t("attachments.inbound")
                        : t("attachments.outbound")}
                  </dd>
                </div>
                {active.mailboxAddress && (
                  <div>
                    <dt>{t("attachments.mailbox")}</dt>
                    <dd>{active.mailboxAddress}</dd>
                  </div>
                )}
                {active.messageSubject && (
                  <div>
                    <dt>{t("attachments.message")}</dt>
                    <dd title={active.messageSubject}>{active.messageSubject}</dd>
                  </div>
                )}
                {active.source === "share" && active.downloads !== undefined && (
                  <div>
                    <dt>{t("attachments.downloads")}</dt>
                    <dd>{active.downloads}</dd>
                  </div>
                )}
              </dl>

              {(active.expired || active.revoked) && (
                <div className="alert alert--warning">{t("attachments.unavailable")}</div>
              )}

              <div className="attachment-manager__actions">
                <a
                  className="btn btn--secondary"
                  href={active.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={active.expired || active.revoked}
                  onClick={(event) => {
                    if (active.expired || active.revoked) event.preventDefault();
                  }}
                >
                  <Download size={16} />
                  {t("attachments.download")}
                </a>
                <button
                  className="btn"
                  type="button"
                  onClick={() => void insertActive()}
                  disabled={busy !== null || Boolean(active.expired || active.revoked)}
                >
                  <MailPlus size={16} />
                  {busy === "insert" ? t("attachments.insert.loading") : t("attachments.insert")}
                </button>
                <button
                  className="btn btn--danger"
                  type="button"
                  onClick={() => void deleteActive()}
                  disabled={busy !== null}
                >
                  <Trash2 size={16} />
                  {busy === "delete" ? t("common.saving") : t("attachments.delete")}
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
