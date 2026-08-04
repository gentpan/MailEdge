import {
  Check,
  ChevronDown,
  Folder,
  Forward,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  PanelLeftClose,
  Paperclip,
  Reply,
  ReplyAll,
  Sparkles,
  Star,
  Trash2,
  TriangleAlert,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import { type SyntheticEvent, useRef, useState } from "react";
import type { CustomFolder, MailFolder, MessageDetail } from "../../../src/shared/message";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import { api, type Contact } from "../lib/api";
import { displayName, formatDateTime, formatSize, PROVIDER_LABELS } from "../lib/format";
import type { ComposeDraft } from "./ComposeModal";
import SenderAvatar from "./SenderAvatar";

interface Props {
  message: MessageDetail | null;
  loading: boolean;
  /** 详情所属信箱，AI 操作要按它路由 */
  mailboxId?: string;
  aiEnabled?: boolean;
  customFolders: CustomFolder[];
  onReply: (message: MessageDetail) => void;
  onReplyAll: (message: MessageDetail) => void;
  onForward: (message: MessageDetail) => void;
  onAiReply: (draft: ComposeDraft) => void;
  onMove: (id: string, target: MailFolder) => void;
  onDelete: (id: string) => void;
  onMarkAllRead: () => void;
  onMarkRead: (message: MessageDetail, isRead: boolean) => void;
  onToggleStar: (message: MessageDetail) => void;
  onClose?: () => void;
  contact?: Contact | null;
  onAddContact?: (email: string, name: string) => void;
}

export default function MessageView({
  message,
  loading,
  mailboxId,
  aiEnabled,
  customFolders,
  onReply,
  onReplyAll,
  onForward,
  onAiReply,
  onMove,
  onDelete,
  onMarkAllRead,
  onMarkRead,
  onToggleStar,
  onClose,
  contact,
  onAddContact,
}: Props) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<"move" | "more" | null>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);

  // 竞态守卫：AI 请求可能跨越邮件切换返回，用序号丢弃过期结果
  const aiSeqRef = useRef(0);

  // 切换邮件时清空上一封的 AI 状态
  const currentId = message?.id ?? null;
  const [seenId, setSeenId] = useState<string | null>(null);
  if (currentId !== seenId) {
    aiSeqRef.current += 1;
    setSeenId(currentId);
    setSummary(message?.aiSummary ?? null);
    setSummarizing(false);
    setReplying(false);
    setAiError(null);
    setOpenMenu(null);
    setFrameHeight(null);
  }

  function resizeHtmlFrame(event: SyntheticEvent<HTMLIFrameElement>) {
    const document = event.currentTarget.contentDocument;
    if (!document) return;

    // 正文高度交给外层详情容器滚动，避免 iframe 自己再出现一条滚动条。
    document.documentElement.style.overflow = "hidden";
    if (document.body) document.body.style.overflow = "visible";

    // HTML 邮件仍然禁用脚本、表单和顶层导航；只读取已加载文档高度，
    // 让外层详情面板负责滚动，避免正文在固定 iframe 高度内被截断。
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
    if (height > 0) setFrameHeight(Math.max(480, height));
  }

  async function summarize(target: MessageDetail) {
    if (!mailboxId) return;
    const seq = ++aiSeqRef.current;
    setSummarizing(true);
    setAiError(null);
    try {
      const result = await api.aiSummarize(target.id, mailboxId);
      if (seq !== aiSeqRef.current) return;
      setSummary(result.summary);
    } catch (error) {
      if (seq !== aiSeqRef.current) return;
      setAiError(error instanceof Error ? error.message : "error");
    } finally {
      if (seq === aiSeqRef.current) setSummarizing(false);
    }
  }

  async function aiReply(target: MessageDetail) {
    if (!mailboxId) return;
    const seq = ++aiSeqRef.current;
    setReplying(true);
    setAiError(null);
    try {
      const result = await api.aiReply(target.id, mailboxId, {});
      if (seq !== aiSeqRef.current) return;
      onAiReply({
        to: target.from.email,
        subject: target.subject.startsWith("Re:") ? target.subject : `Re: ${target.subject}`,
        text: result.draft,
      });
    } catch (error) {
      if (seq !== aiSeqRef.current) return;
      setAiError(error instanceof Error ? error.message : "error");
    } finally {
      if (seq === aiSeqRef.current) setReplying(false);
    }
  }

  if (loading) {
    return (
      <section className="detail-pane">
        <div className="empty">
          <Loader2 size={20} className="spin" />
          <p>{t("list.loading")}</p>
        </div>
      </section>
    );
  }

  if (!message) {
    return (
      <section className="detail-pane">
        <div className="empty">
          <Mail size={32} />
          <p>{t("detail.empty")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-pane">
      <div className="detail-pane__toolbar">
        <button
          className="detail-toolbar__collapse"
          type="button"
          title={t("detail.close")}
          aria-label={t("detail.close")}
          onClick={onClose}
        >
          <PanelLeftClose size={17} />
        </button>

        <div className="detail-toolbar__center">
          <div className="detail-toolbar__group">
            <button
              className="detail-toolbar__action"
              type="button"
              title={t("detail.delete")}
              aria-label={t("detail.delete")}
              onClick={() => onDelete(message.id)}
            >
              <Trash2 size={16} />
              <span>{t("detail.delete")}</span>
            </button>
            <button
              className="detail-toolbar__action"
              type="button"
              title={t("detail.reply")}
              aria-label={t("detail.reply")}
              onClick={() => onReply(message)}
            >
              <Reply size={16} />
              <span>{t("detail.reply")}</span>
            </button>
            <button
              className="detail-toolbar__action"
              type="button"
              title={t("detail.replyAll")}
              aria-label={t("detail.replyAll")}
              onClick={() => onReplyAll(message)}
            >
              <ReplyAll size={16} />
              <span>{t("detail.replyAll")}</span>
            </button>
            <button
              className="detail-toolbar__action"
              type="button"
              title={t("detail.forward")}
              aria-label={t("detail.forward")}
              onClick={() => onForward(message)}
            >
              <Forward size={16} />
              <span>{t("detail.forward")}</span>
            </button>
          </div>

          <div className="detail-toolbar__group">
            <button
              className="detail-toolbar__action"
              type="button"
              title={message.folder === "spam" ? t("detail.moveOutOfSpam") : t("detail.reportSpam")}
              aria-label={message.folder === "spam" ? t("detail.moveOutOfSpam") : t("detail.reportSpam")}
              onClick={() => onMove(message.id, message.folder === "spam" ? "inbox" : "spam")}
            >
              {message.folder === "spam" ? <Inbox size={16} /> : <TriangleAlert size={16} />}
              <span>{message.folder === "spam" ? t("detail.moveOutOfSpam") : t("detail.reportSpam")}</span>
            </button>
            <button
              className="detail-toolbar__action"
              type="button"
              title={t("list.markAllRead")}
              aria-label={t("list.markAllRead")}
              onClick={onMarkAllRead}
            >
              <MailOpen size={16} />
              <span>{t("list.markAllRead")}</span>
            </button>

            <button
              className={`detail-toolbar__action${message.isStarred ? " detail-toolbar__action--starred" : ""}`}
              type="button"
              title={message.isStarred ? t("detail.markUnstarred") : t("detail.markStarred")}
              aria-label={message.isStarred ? t("detail.markUnstarred") : t("detail.markStarred")}
              onClick={() => onToggleStar(message)}
            >
              <Star size={16} fill={message.isStarred ? "currentColor" : "none"} />
              <span>{message.isStarred ? t("detail.markUnstarred") : t("detail.markStarred")}</span>
            </button>
            <button
              className="detail-toolbar__action"
              type="button"
              title={message.isRead ? t("detail.markUnread") : t("detail.markRead")}
              aria-label={message.isRead ? t("detail.markUnread") : t("detail.markRead")}
              onClick={() => onMarkRead(message, !message.isRead)}
            >
              {message.isRead ? <Mail size={16} /> : <MailOpen size={16} />}
              <span>{message.isRead ? t("detail.markUnread") : t("detail.markRead")}</span>
            </button>

            <div className="detail-toolbar__menu">
              <button
                className="detail-toolbar__action"
                type="button"
                title={t("detail.moveTo")}
                aria-label={t("detail.moveTo")}
                aria-expanded={openMenu === "move"}
                onClick={() => setOpenMenu((current) => (current === "move" ? null : "move"))}
              >
                <Folder size={16} />
                <span>{t("detail.moveTo")}</span>
                <ChevronDown size={14} />
              </button>
              {openMenu === "move" && (
                <div className="detail-toolbar__menu-panel">
                  {(
                    [
                      ["inbox", t("detail.moveInbox")],
                      ["archive", t("detail.moveArchive")],
                      ["spam", t("detail.moveSpam")],
                      ["trash", t("detail.moveTrash")],
                      ...customFolders.map((folder) => [folder.id, folder.name] as [string, string]),
                    ] as Array<[MailFolder, string]>
                  ).map(([target, label]) => (
                    <button
                      className="detail-toolbar__menu-item"
                      type="button"
                      key={target}
                      disabled={message.folder === target}
                      onClick={() => {
                        onMove(message.id, target);
                        setOpenMenu(null);
                      }}
                    >
                      {message.folder === target ? <Check size={15} /> : <Folder size={15} />}
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="detail-pane__toolbar-spacer" />
        <button
          className="detail-toolbar__action"
          type="button"
          title={t("detail.more")}
          aria-label={t("detail.more")}
          aria-expanded={openMenu === "more"}
          onClick={() => setOpenMenu((current) => (current === "more" ? null : "more"))}
        >
          <MoreHorizontal size={16} />
          <span>{t("detail.more")}</span>
        </button>
        {openMenu === "more" && (
          <div className="detail-toolbar__menu detail-toolbar__menu--right">
            <div className="detail-toolbar__menu-panel detail-toolbar__menu-panel--right">
              <button className="detail-toolbar__menu-item" type="button" onClick={() => window.print()}>
                <MoreHorizontal size={15} />
                {t("detail.print")}
              </button>
              <button
                className="detail-toolbar__menu-item"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(message.subject);
                  setOpenMenu(null);
                }}
              >
                <Check size={15} />
                {t("detail.copySubject")}
              </button>
              {aiEnabled && mailboxId && message.direction === "inbound" ? (
                <>
                  <button
                    className="detail-toolbar__menu-item"
                    type="button"
                    onClick={() => {
                      void aiReply(message);
                      setOpenMenu(null);
                    }}
                    disabled={replying}
                  >
                    <WandSparkles size={15} />
                    {replying ? t("detail.aiReply.busy") : t("detail.aiReply")}
                  </button>
                  <button
                    className="detail-toolbar__menu-item"
                    type="button"
                    onClick={() => {
                      void summarize(message);
                      setOpenMenu(null);
                    }}
                    disabled={summarizing}
                  >
                    <Sparkles size={15} />
                    {summarizing ? t("detail.aiSummary.busy") : t("detail.aiSummary")}
                  </button>
                </>
              ) : (
                <button className="detail-toolbar__menu-item" type="button" disabled>
                  <MoreHorizontal size={15} />
                  {t("detail.noMoreActions")}
                </button>
              )}
            </div>
          </div>
        )}
        {aiEnabled && mailboxId && message.direction === "inbound" && (
          <button
            className="detail-toolbar__ai-button"
            type="button"
            title={summarizing ? t("detail.aiSummary.busy") : t("detail.aiSummary")}
            aria-label={summarizing ? t("detail.aiSummary.busy") : t("detail.aiSummary")}
            onClick={() => void summarize(message)}
            disabled={summarizing}
          >
            <Sparkles size={18} />
          </button>
        )}
      </div>

      <div className="detail-pane__body">
        {aiError && <div className="alert alert--error">{aiError}</div>}

        {summary && (
          <div className="ai-summary">
            <div className="ai-summary__head">
              <Sparkles size={14} />
              {t("detail.summaryTitle")}
            </div>
            <div className="ai-summary__body">{summary}</div>
          </div>
        )}

        <header className="detail-header detail-header--message">
          <div className="detail-header__subject-row">
            <h2 className="detail-header__subject">{message.subject || t("detail.noSubject")}</h2>
          </div>

          <div className="detail-header__sender">
            <SenderAvatar address={message.from} />
            <div className="detail-header__sender-main">
              <div className="detail-header__sender-line">
                <span className="detail-header__sender-name">{displayName(message.from)}</span>
                <span className="detail-header__sender-email">{message.from.email}</span>
                {message.direction === "inbound" &&
                  onAddContact &&
                  (contact ? (
                    <span className="detail-header__contact-status">
                      <Check size={14} />
                      {t("detail.contactSaved")}
                    </span>
                  ) : (
                    <button
                      className="detail-header__contact-button"
                      type="button"
                      onClick={() => onAddContact(message.from.email, displayName(message.from))}
                    >
                      <UserPlus size={14} />
                      {t("detail.addContact")}
                    </button>
                  ))}
              </div>
              <div className="detail-header__meta">
                <span>
                  {t("detail.to")}：{message.to.map(displayName).join("、")}
                </span>
                <time dateTime={message.receivedAt}>{formatDateTime(message.receivedAt)}</time>
              </div>
            </div>
          </div>

          {message.cc.length > 0 && (
            <div className="detail-header__recipients text-xs">
              {t("detail.cc")}：{message.cc.map(displayName).join("、")}
            </div>
          )}

          {message.direction === "outbound" && message.status && (
            <div className="detail-header__row">
              <span
                className={`badge ${
                  message.status === "sent"
                    ? "badge--success"
                    : message.status === "failed"
                      ? "badge--error"
                      : "badge--warning"
                }`}
              >
                {t(`status.${message.status}` as TranslationKey)}
              </span>
              {message.provider && (
                <span className="text-xs text-tertiary">
                  {PROVIDER_LABELS[message.provider] ?? message.provider}
                </span>
              )}
              {message.internalId && <span className="mono text-tertiary">{message.internalId}</span>}
            </div>
          )}

          {message.error && <div className="alert alert--error">{message.error}</div>}
        </header>

        <div className="detail-body">
          {message.html ? (
            // 用沙箱 iframe 渲染 HTML 正文：禁用脚本、表单与顶层导航。
            // allow-same-origin 仅用于读取文档高度，便于把完整正文交给外层面板滚动。
            <iframe
              className="detail-frame"
              title={message.subject}
              sandbox="allow-same-origin"
              srcDoc={message.html}
              referrerPolicy="no-referrer"
              onLoad={resizeHtmlFrame}
              style={frameHeight ? { height: `${frameHeight}px` } : undefined}
            />
          ) : (
            <pre>{message.text ?? t("detail.noBody")}</pre>
          )}
        </div>

        {message.attachments.length > 0 && (
          <div className="attachment-list">
            {message.attachments.map((attachment) => (
              <a
                key={attachment.id}
                className="attachment-chip"
                href={attachment.downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Paperclip size={14} />
                {attachment.filename}
                <span className="attachment-chip__size">{formatSize(attachment.size)}</span>
                {attachment.mode === "link" && (
                  <span className="badge badge--primary">{t("detail.linkBadge")}</span>
                )}
              </a>
            ))}
          </div>
        )}

        <button
          className="detail-quick-reply"
          type="button"
          onClick={() => onReply(message)}
          aria-label={t("detail.quickReply")}
        >
          <Reply size={18} />
          <span>{t("detail.quickReply.placeholder")}</span>
        </button>
      </div>
    </section>
  );
}
