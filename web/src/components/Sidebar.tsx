import { Link } from "react-router-dom";
import {
  Archive,
  AtSign,
  Inbox,
  Layers,
  Link2,
  MailQuestion,
  Mails,
  PenSquare,
  Send,
  SendHorizontal,
  Settings,
  Trash2,
} from "lucide-react";
import type { FolderStats, MailFolder } from "../../../src/shared/message";
import type { Mailbox, User } from "../lib/api";

export type MailView = "mail" | "outbox" | "shares";

const FOLDERS: Array<{ key: MailFolder; label: string; icon: typeof Inbox }> = [
  { key: "inbox", label: "收件箱", icon: Inbox },
  { key: "catchall", label: "其他地址", icon: MailQuestion },
  { key: "sent", label: "已发送", icon: Send },
  { key: "archive", label: "归档", icon: Archive },
  { key: "trash", label: "回收站", icon: Trash2 },
];

interface Props {
  user: User;
  mailboxes: Mailbox[];
  activeMailboxId: string | undefined;
  activeFolder: MailFolder;
  view: MailView;
  stats: FolderStats[];
  onSelectMailbox: (id: string) => void;
  onSelectFolder: (folder: MailFolder) => void;
  onSelectView: (view: MailView) => void;
  onCompose: () => void;
  onSignOut: () => void;
}

export default function Sidebar({
  user,
  mailboxes,
  activeMailboxId,
  activeFolder,
  view,
  stats,
  onSelectMailbox,
  onSelectFolder,
  onSelectView,
  onCompose,
  onSignOut,
}: Props) {
  const unreadOf = (folder: MailFolder) => stats.find((item) => item.folder === folder)?.unread ?? 0;
  const totalOf = (folder: MailFolder) => stats.find((item) => item.folder === folder)?.total ?? 0;

  // 「其他地址」只在当前信箱是兜底信箱、或已经兜到过邮件时才出现
  const activeMailbox = mailboxes.find((item) => item.id === activeMailboxId) ?? mailboxes[0];
  const showCatchall = Boolean(activeMailbox?.isCatchAll) || totalOf("catchall") > 0;
  const folders = FOLDERS.filter((item) => item.key !== "catchall" || showCatchall);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Mails size={20} />
        <span>MailEdge</span>
      </div>

      <button className="btn" type="button" onClick={onCompose}>
        <PenSquare size={16} />
        写信
      </button>

      <nav className="sidebar__section">
        {folders.map((folder) => {
          const Icon = folder.icon;
          const unread = unreadOf(folder.key);
          const active = view === "mail" && activeFolder === folder.key;
          return (
            <button
              key={folder.key}
              type="button"
              className={`nav-item${active ? " nav-item--active" : ""}`}
              onClick={() => onSelectFolder(folder.key)}
            >
              <Icon size={16} />
              {folder.label}
              {unread > 0 && <span className="nav-item__count">{unread}</span>}
            </button>
          );
        })}
      </nav>

      <nav className="sidebar__section">
        <span className="sidebar__label">投递</span>
        <button
          type="button"
          className={`nav-item${view === "outbox" ? " nav-item--active" : ""}`}
          onClick={() => onSelectView("outbox")}
        >
          <SendHorizontal size={16} />
          发信记录
        </button>
        <button
          type="button"
          className={`nav-item${view === "shares" ? " nav-item--active" : ""}`}
          onClick={() => onSelectView("shares")}
        >
          <Link2 size={16} />
          附件链接
        </button>
      </nav>

      {mailboxes.length > 1 && (
        <div className="sidebar__section">
          <span className="sidebar__label">信箱</span>
          <button
            type="button"
            className={`nav-item${activeMailboxId === "all" ? " nav-item--active" : ""}`}
            onClick={() => onSelectMailbox("all")}
          >
            <Layers size={16} />
            全部信箱
          </button>
          {mailboxes.map((mailbox) => (
            <button
              key={mailbox.id}
              type="button"
              className={`nav-item${activeMailboxId === mailbox.id ? " nav-item--active" : ""}`}
              onClick={() => onSelectMailbox(mailbox.id)}
              title={mailbox.address}
            >
              <AtSign size={16} />
              <span className="nav-item__text">{mailbox.address}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar__footer">
        <Link className="nav-item" to="/settings">
          <Settings size={16} />
          设置
        </Link>
        <span className="sidebar__user">{user.name || user.email}</span>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onSignOut}>
          退出登录
        </button>
      </div>
    </aside>
  );
}
