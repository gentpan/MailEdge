import { Link } from "react-router-dom";
import { Archive, Inbox, Mails, PenSquare, Send, Settings, Trash2 } from "lucide-react";
import type { FolderStats, MailFolder } from "../../../src/shared/message";
import type { Mailbox, User } from "../lib/api";

const FOLDERS: Array<{ key: MailFolder; label: string; icon: typeof Inbox }> = [
  { key: "inbox", label: "收件箱", icon: Inbox },
  { key: "sent", label: "已发送", icon: Send },
  { key: "archive", label: "归档", icon: Archive },
  { key: "trash", label: "回收站", icon: Trash2 },
];

interface Props {
  user: User;
  mailboxes: Mailbox[];
  activeMailboxId: string | undefined;
  activeFolder: MailFolder;
  stats: FolderStats[];
  onSelectMailbox: (id: string) => void;
  onSelectFolder: (folder: MailFolder) => void;
  onCompose: () => void;
  onSignOut: () => void;
}

export default function Sidebar({
  user,
  mailboxes,
  activeMailboxId,
  activeFolder,
  stats,
  onSelectMailbox,
  onSelectFolder,
  onCompose,
  onSignOut,
}: Props) {
  const unreadOf = (folder: MailFolder) => stats.find((item) => item.folder === folder)?.unread ?? 0;

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
        {FOLDERS.map((folder) => {
          const Icon = folder.icon;
          const unread = unreadOf(folder.key);
          return (
            <button
              key={folder.key}
              type="button"
              className={`nav-item${activeFolder === folder.key ? " nav-item--active" : ""}`}
              onClick={() => onSelectFolder(folder.key)}
            >
              <Icon size={16} />
              {folder.label}
              {unread > 0 && <span className="nav-item__count">{unread}</span>}
            </button>
          );
        })}
      </nav>

      {mailboxes.length > 1 && (
        <div className="sidebar__section">
          <span className="sidebar__label">信箱</span>
          {mailboxes.map((mailbox) => (
            <button
              key={mailbox.id}
              type="button"
              className={`nav-item${activeMailboxId === mailbox.id ? " nav-item--active" : ""}`}
              onClick={() => onSelectMailbox(mailbox.id)}
            >
              {mailbox.address}
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
