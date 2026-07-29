import { Archive, Loader2, Mail, Paperclip, Reply, Star, Trash2 } from "lucide-react";
import type { MessageDetail } from "../../../src/shared/message";
import { PROVIDER_LABELS, STATUS_LABELS, displayName, formatDateTime, formatSize } from "../lib/format";

interface Props {
  message: MessageDetail | null;
  loading: boolean;
  onReply: (message: MessageDetail) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStar: (message: MessageDetail) => void;
}

export default function MessageView({ message, loading, onReply, onArchive, onDelete, onToggleStar }: Props) {
  if (loading) {
    return (
      <section className="detail-pane">
        <div className="empty">
          <Loader2 size={20} className="spin" />
          <p>加载中…</p>
        </div>
      </section>
    );
  }

  if (!message) {
    return (
      <section className="detail-pane">
        <div className="empty">
          <Mail size={32} />
          <p>选择一封邮件查看内容</p>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-pane">
      <div className="detail-pane__toolbar">
        <button className="btn btn--icon" type="button" title="回复" onClick={() => onReply(message)}>
          <Reply size={16} />
        </button>
        <button
          className="btn btn--icon"
          type="button"
          title={message.isStarred ? "取消星标" : "加星标"}
          onClick={() => onToggleStar(message)}
        >
          <Star size={16} />
        </button>
        <button className="btn btn--icon" type="button" title="归档" onClick={() => onArchive(message.id)}>
          <Archive size={16} />
        </button>
        <div className="detail-pane__toolbar-spacer" />
        <button className="btn btn--icon" type="button" title="删除" onClick={() => onDelete(message.id)}>
          <Trash2 size={16} />
        </button>
      </div>

      <div className="detail-pane__body">
        <header className="detail-header">
          <h2 className="detail-header__subject">{message.subject || "(无主题)"}</h2>

          <div className="detail-header__row">
            <span className="detail-header__name">{displayName(message.from)}</span>
            <span className="text-tertiary text-xs">{message.from.email}</span>
            <span className="text-tertiary text-xs">{formatDateTime(message.receivedAt)}</span>
          </div>

          <div className="detail-header__row text-xs">收件人：{message.to.map(displayName).join("、")}</div>
          {message.cc.length > 0 && (
            <div className="detail-header__row text-xs">抄送：{message.cc.map(displayName).join("、")}</div>
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
                {STATUS_LABELS[message.status] ?? message.status}
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
            // 用沙箱 iframe 渲染 HTML 正文：禁用脚本、表单与同源访问
            <iframe
              className="detail-frame"
              title="邮件正文"
              sandbox=""
              srcDoc={message.html}
              referrerPolicy="no-referrer"
            />
          ) : (
            <pre>{message.text ?? "(无正文)"}</pre>
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
                {attachment.mode === "link" && <span className="badge badge--primary">下载链接</span>}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
