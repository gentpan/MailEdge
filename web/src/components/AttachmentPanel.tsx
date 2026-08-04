import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  Link2,
  Loader2,
  MailPlus,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "../i18n";
import type { ManagedAttachmentRef, ManagedAttachmentView } from "../lib/api";
import { api } from "../lib/api";
import { formatDateTime, formatSize } from "../lib/format";
import { useSettingsToast } from "./settings/SettingsToast";

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

type AttachmentFilter = "all" | "message" | "share";

export default function AttachmentPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<ManagedAttachmentView[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<AttachmentFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"delete" | "insert" | "revoke" | null>(null);
  const { showToast, dismissToast } = useSettingsToast();

  const load = useCallback(async () => {
    setLoading(true);
    dismissToast();
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
      showToast({
        kind: "error",
        text: caught instanceof Error ? caught.message : t("attachments.loadError"),
      });
    } finally {
      setLoading(false);
    }
  }, [dismissToast, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const matchesFilter = filter === "all" || item.source === filter;
      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;
      return [item.filename, item.contentType, item.mailboxAddress, item.messageSubject]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [filter, items, query]);

  const active = useMemo(
    () => visibleItems.find((item) => itemKey(item) === activeKey) ?? null,
    [activeKey, visibleItems],
  );
  const totalBytes = useMemo(() => items.reduce((total, item) => total + item.size, 0), [items]);
  const sharedCount = useMemo(() => items.filter((item) => item.source === "share").length, [items]);

  useEffect(() => {
    if (!visibleItems.length) {
      setActiveKey(null);
      return;
    }
    if (!activeKey || !visibleItems.some((item) => itemKey(item) === activeKey)) {
      setActiveKey(itemKey(visibleItems[0]!));
    }
  }, [activeKey, visibleItems]);

  async function deleteActive() {
    if (!active || !window.confirm(t("attachments.delete.confirm"))) return;
    const ref = attachmentRef(active);
    if (!ref) return;
    setBusy("delete");
    dismissToast();
    try {
      await api.deleteManagedAttachment(ref);
      const next = items.filter((item) => itemKey(item) !== itemKey(active));
      setItems(next);
      setActiveKey(next[0] ? itemKey(next[0]) : null);
      showToast({ kind: "success", text: t("attachments.deleted") });
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : t("toast.actionFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function insertActive() {
    if (!active || active.expired || active.revoked) return;
    const ref = attachmentRef(active);
    if (!ref) return;
    setBusy("insert");
    dismissToast();
    try {
      const staged = await api.stageAttachment(ref);
      navigate("/inbox", { state: { composeStagedAttachment: staged } });
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : t("toast.actionFailed") });
      setBusy(null);
    }
  }

  async function copyShareLink() {
    if (!active?.token || active.source !== "share") return;
    const url = `${window.location.origin}/d/${encodeURIComponent(active.token)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      showToast({ kind: "success", text: t("attachments.linkCopied") });
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : t("toast.actionFailed") });
    }
  }

  async function revokeActiveShare() {
    if (active?.source !== "share" || !active.token || active.revoked) return;
    if (!window.confirm(t("attachments.revoke.confirm"))) return;
    setBusy("revoke");
    dismissToast();
    try {
      await api.revokeShare(active.token);
      await load();
      showToast({ kind: "success", text: t("attachments.revoked") });
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : t("toast.actionFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="attachment-manager-page">
      <header className="attachment-manager__hero">
        <div className="attachment-manager__hero-copy">
          <div className="attachment-manager__eyebrow">
            <span className="attachment-manager__eyebrow-icon">
              <Paperclip size={15} />
            </span>
            {t("attachments.title")}
          </div>
          <h1>{t("attachments.title")}</h1>
          <p>{t("attachments.desc")}</p>
        </div>
        <button
          className="btn btn--secondary attachment-manager__refresh"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : undefined} />
          {t("common.refresh")}
        </button>
      </header>

      <section className="attachment-manager__stats" aria-label={t("attachments.title")}>
        <article className="attachment-manager__stat">
          <span className="attachment-manager__stat-icon attachment-manager__stat-icon--blue">
            <Paperclip size={17} />
          </span>
          <div>
            <strong>{items.length}</strong>
            <span>{t("attachments.totalFiles")}</span>
          </div>
        </article>
        <article className="attachment-manager__stat">
          <span className="attachment-manager__stat-icon attachment-manager__stat-icon--violet">
            <Link2 size={17} />
          </span>
          <div>
            <strong>{sharedCount}</strong>
            <span>{t("attachments.sharedLinks")}</span>
          </div>
        </article>
        <article className="attachment-manager__stat">
          <span className="attachment-manager__stat-icon attachment-manager__stat-icon--green">
            <HardDrive size={17} />
          </span>
          <div>
            <strong>{formatSize(totalBytes)}</strong>
            <span>{t("attachments.storageUsed")}</span>
          </div>
        </article>
      </section>

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
        <>
          <section className="attachment-manager__toolbar" aria-label={t("attachments.title")}>
            <div className="attachment-manager__filters" role="tablist">
              {(
                [
                  ["all", "attachments.all"],
                  ["message", "attachments.mailAttachments"],
                  ["share", "attachments.shareLinks"],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={`attachment-manager__filter${filter === value ? " attachment-manager__filter--active" : ""}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  key={value}
                  onClick={() => setFilter(value)}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <label className="attachment-manager__search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">{t("attachments.search")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("attachments.search")}
                type="search"
              />
            </label>
          </section>

          {!visibleItems.length ? (
            <div className="empty attachment-manager__no-results">
              <Search size={24} />
              <p>{t("attachments.noResults")}</p>
            </div>
          ) : (
            <div className="attachment-manager">
              <section className="attachment-manager__list" aria-label={t("attachments.title")}>
                <div className="attachment-manager__list-head">
                  <span>{t("attachments.filteredCount", { n: visibleItems.length })}</span>
                  {visibleItems.length !== items.length && (
                    <span>{t("attachments.count", { n: items.length })}</span>
                  )}
                </div>
                <div className="attachment-manager__list-scroll">
                  {visibleItems.map((item) => (
                    <button
                      className={`attachment-manager__item${itemKey(item) === activeKey ? " attachment-manager__item--active" : ""}`}
                      type="button"
                      key={itemKey(item)}
                      onClick={() => setActiveKey(itemKey(item))}
                    >
                      <span className="attachment-manager__item-icon">
                        {item.source === "share" ? <Link2 size={16} /> : <FileText size={16} />}
                      </span>
                      <span className="attachment-manager__item-main">
                        <strong className="attachment-manager__item-name" title={item.filename}>
                          {item.filename}
                        </strong>
                        <span className="attachment-manager__item-meta">
                          <span>
                            {item.source === "share"
                              ? t("attachments.share")
                              : item.direction === "inbound"
                                ? t("attachments.inbound")
                                : t("attachments.outbound")}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatSize(item.size)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDateTime(item.uploadedAt)}</span>
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
                    {active.source === "share" && active.token && (
                      <div className="attachment-manager__meta-wide">
                        <dt>{t("attachments.shareLink")}</dt>
                        <dd className="attachment-manager__share-url">
                          <code>{`${window.location.origin}/d/${encodeURIComponent(active.token)}`}</code>
                          <button
                            className="btn btn--ghost btn--icon btn--sm"
                            type="button"
                            onClick={() => void copyShareLink()}
                            aria-label={t("attachments.copyLink")}
                            title={t("attachments.copyLink")}
                          >
                            <Copy size={15} />
                          </button>
                        </dd>
                      </div>
                    )}
                  </dl>

                  {(active.expired || active.revoked) && (
                    <div className="alert alert--warning">{t("attachments.unavailable")}</div>
                  )}

                  <div className="attachment-manager__actions">
                    {active.source === "share" && active.token && (
                      <>
                        <a
                          className="btn btn--secondary"
                          href={`/d/${encodeURIComponent(active.token)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={active.expired || active.revoked}
                          onClick={(event) => {
                            if (active.expired || active.revoked) event.preventDefault();
                          }}
                        >
                          <ExternalLink size={16} />
                          {t("attachments.openLink")}
                        </a>
                        <button
                          className="btn btn--secondary"
                          type="button"
                          onClick={() => void revokeActiveShare()}
                          disabled={busy !== null || Boolean(active.revoked)}
                        >
                          <Link2 size={16} />
                          {busy === "revoke" ? t("common.saving") : t("attachments.revoke")}
                        </button>
                      </>
                    )}
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
        </>
      )}
    </div>
  );
}
