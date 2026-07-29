import { AtSign, Inbox, Loader2, Paperclip, Search, Star } from "lucide-react";
import type { MailFolder, MessageSummary } from "../../../src/shared/message";
import { STATUS_LABELS, displayName, formatTime } from "../lib/format";

interface Props {
  items: MessageSummary[];
  loading: boolean;
  activeId: string | null;
  search: string;
  /** 当前文件夹，用于决定空态文案与是否显示原始收件人 */
  folder: MailFolder;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

const EMPTY_TEXT: Partial<Record<MailFolder, { title: string; hint?: string }>> = {
  catchall: {
    title: "还没有兜底邮件",
    hint: "发到本域名但没有登记过的地址，会出现在这里",
  },
  trash: { title: "回收站是空的" },
  archive: { title: "还没有归档的邮件" },
};

export default function MessageList({
  items,
  loading,
  activeId,
  search,
  folder,
  onSearch,
  onSelect,
  onLoadMore,
  hasMore,
}: Props) {
  const empty = EMPTY_TEXT[folder] ?? { title: "这里还没有邮件" };
  const showRecipient = folder === "catchall";
  return (
    <section className="list-pane">
      <div className="list-pane__header">
        <div className="list-pane__search">
          <Search size={16} />
          <input
            className="input"
            value={search}
            placeholder="搜索主题、发件人、正文"
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="list-pane__body">
        {loading && !items.length && (
          <div className="empty">
            <Loader2 size={20} className="spin" />
            <p>加载中…</p>
          </div>
        )}

        {!loading && !items.length && (
          <div className="empty">
            <Inbox size={32} />
            <p>{empty.title}</p>
            {empty.hint && <p className="text-xs">{empty.hint}</p>}
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
            onClick={() => onSelect(item.id)}
          >
            <div className="message-row__top">
              <span className="message-row__from">
                {item.direction === "outbound"
                  ? `发往 ${item.to.map(displayName).join("、")}`
                  : displayName(item.from)}
              </span>
              <span className="message-row__time">{formatTime(item.receivedAt)}</span>
            </div>
            <div className="message-row__subject">{item.subject || "(无主题)"}</div>
            {showRecipient && (
              <div className="message-row__to">
                <AtSign size={11} />
                发给 {item.to.map((address) => address.email).join("、")}
              </div>
            )}
            <div className="message-row__snippet">{item.snippet}</div>
            {(item.hasAttachments || item.isStarred || item.status) && (
              <div className="message-row__meta">
                {item.isStarred && <Star size={12} />}
                {item.hasAttachments && <Paperclip size={12} />}
                {item.status && item.status !== "sent" && (
                  <span
                    className={`badge ${item.status === "failed" ? "badge--error" : "badge--warning"}`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                )}
              </div>
            )}
          </button>
        ))}

        {hasMore && (
          <button className="btn btn--ghost btn--block" type="button" onClick={onLoadMore} disabled={loading}>
            {loading ? "加载中…" : "加载更多"}
          </button>
        )}
      </div>
    </section>
  );
}
