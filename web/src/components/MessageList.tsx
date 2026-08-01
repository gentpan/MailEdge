import { AtSign, Inbox, Loader2, Paperclip, Search, Star } from "lucide-react";
import { MAIL_CATEGORIES } from "../../../src/ai/types";
import type { MailFolder, MessageSummary } from "../../../src/shared/message";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import { displayName, formatTime } from "../lib/format";

interface Props {
  items: MessageSummary[];
  loading: boolean;
  activeId: string | null;
  search: string;
  /** 当前文件夹，用于决定空态文案与是否显示原始收件人 */
  folder: MailFolder;
  /** 聚合视图下标出每封信属于哪个信箱 */
  showMailbox?: boolean;
  /** 当前分类过滤（空 = 全部） */
  category?: string;
  /** 是否显示分类分栏（AI 开启且在收件箱/其他地址时） */
  showCategories?: boolean;
  onSelectCategory?: (category: string) => void;
  onSearch: (value: string) => void;
  onSelect: (message: MessageSummary) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

const EMPTY_TEXT: Partial<Record<MailFolder, { title: TranslationKey; hint?: TranslationKey }>> = {
  catchall: { title: "list.empty.catchall", hint: "list.empty.catchall.hint" },
  trash: { title: "list.empty.trash" },
  archive: { title: "list.empty.archive" },
};

export default function MessageList({
  items,
  loading,
  activeId,
  search,
  folder,
  showMailbox,
  category,
  showCategories,
  onSelectCategory,
  onSearch,
  onSelect,
  onLoadMore,
  hasMore,
}: Props) {
  const { t } = useI18n();
  const empty = EMPTY_TEXT[folder] ?? { title: "list.empty.default" as TranslationKey };
  const showRecipient = folder === "catchall";
  return (
    <section className="list-pane">
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
      </div>

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

        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={[
              "message-row",
              item.isRead ? "" : "message-row--unread",
              activeId === item.id ? "message-row--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(item)}
          >
            <div className="message-row__top">
              {showMailbox && item.mailboxAddress && (
                <span className="message-row__mailbox" title={item.mailboxAddress}>
                  {item.mailboxAddress.split("@")[0]}
                </span>
              )}
              <span className="message-row__from">
                {item.direction === "outbound"
                  ? `${t("list.sentTo")} ${item.to.map(displayName).join("、")}`
                  : displayName(item.from)}
              </span>
              <span className="message-row__time">{formatTime(item.receivedAt)}</span>
            </div>
            <div className="message-row__subject">{item.subject || t("detail.noSubject")}</div>
            {showRecipient && (
              <div className="message-row__to">
                <AtSign size={11} />
                {t("list.to")} {item.to.map((address) => address.email).join("、")}
              </div>
            )}
            <div className="message-row__snippet">{item.snippet}</div>
            {(item.hasAttachments || item.isStarred || item.status || item.category) && (
              <div className="message-row__meta">
                {item.isStarred && <Star size={12} />}
                {item.hasAttachments && <Paperclip size={12} />}
                {item.category && MAIL_CATEGORIES.includes(item.category as never) && (
                  <span className="badge">{t(`cat.${item.category}` as TranslationKey)}</span>
                )}
                {item.status && item.status !== "sent" && (
                  <span className={`badge ${item.status === "failed" ? "badge--error" : "badge--warning"}`}>
                    {t(`status.${item.status}` as TranslationKey)}
                  </span>
                )}
              </div>
            )}
          </button>
        ))}

        {hasMore && (
          <button className="btn btn--ghost btn--block" type="button" onClick={onLoadMore} disabled={loading}>
            {loading ? t("list.loading") : t("list.loadMore")}
          </button>
        )}
      </div>
    </section>
  );
}
