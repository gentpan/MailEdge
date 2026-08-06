import {
  Archive,
  ArchiveRestore,
  AtSign,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Search,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { MAIL_CATEGORIES } from "../../../src/ai/types";
import type { MailFolder, MessageSummary } from "../../../src/shared/message";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import { displayName, formatTime } from "../lib/format";
import SenderAvatar from "./SenderAvatar";

export type MessageListStyle = "comfortable" | "compact";
export const MESSAGE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type MessagePageSize = (typeof MESSAGE_PAGE_SIZE_OPTIONS)[number];

interface Props {
  items: MessageSummary[];
  loading: boolean;
  activeId: string | null;
  search: string;
  /** 当前文件夹，用于决定空态文案与是否显示原始收件人 */
  folder: MailFolder;
  /** 自定义文件夹在列表标题中使用用户设置的名称 */
  folderLabel?: string;
  listStyle: MessageListStyle;
  /** 当前分类过滤（空 = 全部） */
  category?: string;
  /** 是否显示收件箱分类分栏 */
  showCategories?: boolean;
  onSelectCategory?: (category: string) => void;
  onSearch: (value: string) => void;
  onMarkAllRead: () => void;
  onMove: (message: MessageSummary, target: MailFolder) => void;
  onDelete: (message: MessageSummary) => void;
  onMarkRead: (message: MessageSummary, isRead: boolean) => void;
  onToggleStar: (message: MessageSummary) => void;
  onSelect: (message: MessageSummary) => void;
  page: number;
  pageSize: MessagePageSize;
  /** 详情展开时，左侧列表只保留导航信息，正文摘要交给右侧详情区。 */
  detailOpen?: boolean;
  hasPrevious: boolean;
  hasMore: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageSizeChange: (pageSize: MessagePageSize) => void;
}

const EMPTY_TEXT: Partial<Record<MailFolder, { title: TranslationKey; hint?: TranslationKey }>> = {
  catchall: { title: "list.empty.catchall", hint: "list.empty.catchall.hint" },
  trash: { title: "list.empty.trash" },
  archive: { title: "list.empty.archive" },
  spam: { title: "list.empty.spam" },
};

function groupMessages(items: MessageSummary[]): Array<{ key: string; items: MessageSummary[] }> {
  const groups = new Map<string, MessageSummary[]>();
  for (const item of items) {
    const key = localDayKey(item.receivedAt);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups, ([key, groupedItems]) => ({ key, items: groupedItems }));
}

function localDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function groupLabel(key: string, lang: "zh" | "en", t: (key: TranslationKey) => string): string {
  if (key === "unknown") return t("list.today");
  const [yearText, monthText, dayText] = key.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return t("list.today");
  const date = new Date(year, month, day);
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

export default function MessageList({
  items,
  loading,
  activeId,
  search,
  folder,
  folderLabel,
  listStyle,
  category,
  showCategories,
  onSelectCategory,
  onSearch,
  onMarkAllRead,
  onMove,
  onDelete,
  onMarkRead,
  onToggleStar,
  onSelect,
  page,
  pageSize,
  detailOpen = false,
  hasPrevious,
  hasMore,
  onPreviousPage,
  onNextPage,
  onPageSizeChange,
}: Props) {
  const { lang, t } = useI18n();
  const empty = EMPTY_TEXT[folder] ?? { title: "list.empty.default" as TranslationKey };
  const showRecipient = folder === "catchall";
  const groups = groupMessages(items);
  return (
    <section
      className={`list-pane${detailOpen ? " list-pane--detail-open" : ""}${folder === "sent" ? " list-pane--sent" : ""}`}
    >
      <div className="list-pane__header">
        <div className="list-pane__search">
          <Search size={16} />
          <input
            className="input"
            value={search}
            placeholder={t("list.search")}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <button
          className="btn btn--icon"
          type="button"
          title={t("list.markAllRead")}
          aria-label={t("list.markAllRead")}
          onClick={onMarkAllRead}
        >
          <CheckCheck size={16} />
        </button>
      </div>

      <div className="list-pane__title">{folderLabel ?? t(`folder.${folder}` as TranslationKey)}</div>

      {showCategories && (
        <div className="cat-tabs">
          <button
            type="button"
            className={`cat-tab${!category ? " cat-tab--active" : ""}`}
            onClick={() => onSelectCategory?.("")}
          >
            {t("cat.all")}
          </button>
          {MAIL_CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              className={`cat-tab${category === key ? " cat-tab--active" : ""}`}
              onClick={() => onSelectCategory?.(key)}
            >
              {t(`cat.${key}`)}
            </button>
          ))}
        </div>
      )}

      <div className="list-pane__body">
        {loading && !items.length && (
          <div className="empty">
            <Loader2 size={20} className="spin" />
            <p>{t("list.loading")}</p>
          </div>
        )}

        {!loading && !items.length && (
          <div className="empty">
            <Inbox size={32} />
            <p>{t(empty.title)}</p>
            {empty.hint && <p className="text-xs">{t(empty.hint)}</p>}
          </div>
        )}

        {groups.map((group) => (
          <section className="message-group" key={group.key}>
            <h3 className="message-group__label">{groupLabel(group.key, lang, t)}</h3>
            {group.items.map((item) => {
              const isSentFolder = folder === "sent";
              const sender =
                item.direction === "outbound"
                  ? item.to.length
                    ? item.to.map(displayName).join("、")
                    : t("list.sentTo")
                  : displayName(item.from);
              const avatarAddress = item.direction === "outbound" ? (item.to[0] ?? item.from) : item.from;
              const subject = item.subject || t("detail.noSubject");
              const recipient = item.to.map((address) => address.email).join("、");
              const categoryKey =
                item.category && MAIL_CATEGORIES.includes(item.category as never) ? item.category : null;
              const subjectMarkers = (categoryKey || item.hasAttachments || item.isStarred) && (
                <span
                  className="message-row__subject-markers"
                  title={item.hasAttachments ? t("attachments.title") : undefined}
                >
                  {item.isStarred && (
                    <Star
                      className="message-row__star-marker"
                      size={14}
                      fill="currentColor"
                      aria-label={t("detail.unstar")}
                    />
                  )}
                  {categoryKey && (
                    <span
                      className={`badge badge--category badge--category-${categoryKey}`}
                      title={t(`cat.${categoryKey}` as TranslationKey)}
                    >
                      {t(`cat.${categoryKey}` as TranslationKey)}
                    </span>
                  )}
                  {item.hasAttachments && (
                    <Paperclip className="message-row__attachment-icon" size={13} aria-hidden="true" />
                  )}
                </span>
              );
              const meta = item.status && (
                <span className="message-row__meta">
                  {(item.status !== "sent" || isSentFolder) && (
                    <span
                      className={`badge ${
                        item.status === "sent"
                          ? "badge--success"
                          : item.status === "failed"
                            ? "badge--error"
                            : "badge--warning"
                      }`}
                    >
                      {t(`status.${item.status}` as TranslationKey)}
                    </span>
                  )}
                </span>
              );

              const archiveTarget: MailFolder = folder === "archive" ? "inbox" : "archive";
              const ArchiveIcon = folder === "archive" ? ArchiveRestore : Archive;
              const archiveLabel = folder === "archive" ? t("detail.moveInbox") : t("detail.moveArchive");

              return (
                <div
                  key={item.id}
                  className={[
                    "message-row",
                    listStyle === "compact" ? "message-row--compact" : "message-row--comfortable",
                    isSentFolder ? "message-row--sent" : "",
                    item.isRead ? "" : "message-row--unread",
                    activeId === item.id ? "message-row--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button className="message-row__content" type="button" onClick={() => onSelect(item)}>
                    {listStyle === "compact" ? (
                      <div className="message-row__line">
                        <span className="message-row__sender">
                          <SenderAvatar address={avatarAddress} />
                          <span className="message-row__from" title={sender}>
                            {sender}
                          </span>
                        </span>
                        <span className="message-row__subject-cell">
                          <span
                            className={`message-row__subject${subjectMarkers ? " message-row__subject--with-markers" : ""}`}
                            title={subject}
                          >
                            {subject}
                          </span>
                          {subjectMarkers}
                        </span>
                        <span className="message-row__snippet-cell">
                          {showRecipient && (
                            <span className="message-row__to" title={`${t("list.to")} ${recipient}`}>
                              <AtSign size={11} />
                              {t("list.to")} {recipient}
                            </span>
                          )}
                          {item.snippet && (
                            <span className="message-row__snippet" title={item.snippet}>
                              {item.snippet}
                            </span>
                          )}
                        </span>
                        {meta}
                        <span className="message-row__time">
                          {formatTime(item.receivedAt, lang === "zh" ? "zh-CN" : "en-US")}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="message-row__top">
                          <SenderAvatar address={avatarAddress} />
                          <span className="message-row__from" title={sender}>
                            {sender}
                          </span>
                          <span className="message-row__time">
                            {formatTime(item.receivedAt, lang === "zh" ? "zh-CN" : "en-US")}
                          </span>
                        </div>
                        <div className="message-row__subject-line">
                          <span className="message-row__subject" title={subject}>
                            {subject}
                          </span>
                          {subjectMarkers}
                        </div>
                        {showRecipient && (
                          <div className="message-row__to" title={`${t("list.to")} ${recipient}`}>
                            <AtSign size={11} />
                            {t("list.to")} {recipient}
                          </div>
                        )}
                        <div className="message-row__snippet" title={item.snippet}>
                          {item.snippet}
                        </div>
                        {meta}
                      </>
                    )}
                  </button>

                  <div className="message-row__actions">
                    {item.direction !== "outbound" && (
                      <button
                        className="message-row__action"
                        type="button"
                        title={folder === "spam" ? t("detail.moveOutOfSpam") : t("detail.reportSpam")}
                        aria-label={folder === "spam" ? t("detail.moveOutOfSpam") : t("detail.reportSpam")}
                        onClick={() => onMove(item, folder === "spam" ? "inbox" : "spam")}
                      >
                        {folder === "spam" ? <Inbox size={17} /> : <TriangleAlert size={17} />}
                      </button>
                    )}
                    <button
                      className={`message-row__action${item.isStarred ? " message-row__action--starred" : ""}`}
                      type="button"
                      title={item.isStarred ? t("detail.unstar") : t("detail.star")}
                      aria-label={item.isStarred ? t("detail.unstar") : t("detail.star")}
                      onClick={() => onToggleStar(item)}
                    >
                      <Star size={17} fill={item.isStarred ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="message-row__action"
                      type="button"
                      title={archiveLabel}
                      aria-label={archiveLabel}
                      onClick={() => onMove(item, archiveTarget)}
                    >
                      <ArchiveIcon size={17} />
                    </button>
                    <button
                      className="message-row__action"
                      type="button"
                      title={t("detail.delete")}
                      aria-label={t("detail.delete")}
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 size={17} />
                    </button>
                    {item.direction !== "outbound" && (
                      <button
                        className="message-row__action"
                        type="button"
                        title={item.isRead ? t("detail.markUnread") : t("detail.markRead")}
                        aria-label={item.isRead ? t("detail.markUnread") : t("detail.markRead")}
                        onClick={() => onMarkRead(item, !item.isRead)}
                      >
                        {item.isRead ? <MailOpen size={17} /> : <Mail size={17} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <nav className="list-pane__pagination" aria-label={t("list.pagination")}>
        <label className="list-pane__page-size">
          <span>{t("list.pageSize")}</span>
          <select
            className="select list-pane__page-size-select"
            value={pageSize}
            disabled={loading}
            onChange={(event) => onPageSizeChange(Number(event.target.value) as MessagePageSize)}
          >
            {MESSAGE_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {t("list.pageSizeOption", { n: size })}
              </option>
            ))}
          </select>
        </label>
        <span className="list-pane__page-info">{t("list.pageInfo", { page: page + 1 })}</span>
        <div className="list-pane__page-actions">
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={onPreviousPage}
            disabled={!hasPrevious || loading}
            title={t("list.previousPage")}
            aria-label={t("list.previousPage")}
          >
            <ChevronLeft size={15} />
            <span>{t("list.previousPage")}</span>
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={onNextPage}
            disabled={!hasMore || loading}
            title={t("list.nextPage")}
            aria-label={t("list.nextPage")}
          >
            <span>{t("list.nextPage")}</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </nav>
    </section>
  );
}
