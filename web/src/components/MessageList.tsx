import { Inbox, Loader2, Paperclip, Search, Star } from "lucide-react";
import type { MessageSummary } from "../../../src/shared/message";
import { STATUS_LABELS, displayName, formatTime } from "../lib/format";

interface Props {
  items: MessageSummary[];
  loading: boolean;
  activeId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
}

export default function MessageList({
  items,
  loading,
  activeId,
  search,
  onSearch,
  onSelect,
  onLoadMore,
  hasMore,
}: Props) {
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
            <p>这里还没有邮件</p>
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
