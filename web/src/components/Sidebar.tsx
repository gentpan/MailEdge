import { Link } from "react-router-dom";
import {
  Archive,
  AtSign,
  Inbox,
  Layers,
  Link2,
  LogOut,
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
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import LanguageToggle from "./LanguageToggle";

export type MailView = "mail" | "outbox" | "shares";

/** 头像用的首字母：优先取名字，退到邮箱首字符 */
function initial(value: string): string {
  return (value.trim()[0] ?? "?").toUpperCase();
}

const FOLDERS: Array<{ key: MailFolder; labelKey: TranslationKey; icon: typeof Inbox }> = [
  { key: "inbox", labelKey: "folder.inbox", icon: Inbox },
  { key: "catchall", labelKey: "folder.catchall", icon: MailQuestion },
  { key: "sent", labelKey: "folder.sent", icon: Send },
  { key: "archive", labelKey: "folder.archive", icon: Archive },
  { key: "trash", labelKey: "folder.trash", icon: Trash2 },
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
  const { t } = useI18n();
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
        <span>{t("app.name")}</span>
      </div>

      <button className="btn" type="button" onClick={onCompose}>
        <PenSquare size={16} />
        {t("nav.compose")}
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
              {t(folder.labelKey)}
              {unread > 0 && <span className="nav-item__count">{unread}</span>}
            </button>
          );
        })}
      </nav>

      <nav className="sidebar__section">
        <span className="sidebar__label">{t("nav.delivery")}</span>
        <button
          type="button"
          className={`nav-item${view === "outbox" ? " nav-item--active" : ""}`}
          onClick={() => onSelectView("outbox")}
        >
          <SendHorizontal size={16} />
          {t("nav.outbox")}
        </button>
        <button
          type="button"
          className={`nav-item${view === "shares" ? " nav-item--active" : ""}`}
          onClick={() => onSelectView("shares")}
        >
          <Link2 size={16} />
          {t("nav.shares")}
        </button>
      </nav>

      {mailboxes.length > 1 && (
        <div className="sidebar__section">
          <span className="sidebar__label">{t("nav.mailboxes")}</span>
          <button
            type="button"
            className={`nav-item${activeMailboxId === "all" ? " nav-item--active" : ""}`}
            onClick={() => onSelectMailbox("all")}
          >
            <Layers size={16} />
            {t("nav.allMailboxes")}
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
          {t("nav.settings")}
        </Link>

        <div className="user-card">
          <span className="user-card__avatar">{initial(user.name || user.email)}</span>
          <div className="user-card__meta">
            <span className="user-card__name">{user.name || user.email}</span>
            {user.name && <span className="user-card__email">{user.email}</span>}
          </div>
        </div>

        <div className="sidebar__footer-row">
          <LanguageToggle />
          <button className="btn btn--ghost btn--sm" type="button" onClick={onSignOut} title={t("nav.signOut")}>
            <LogOut size={14} />
            {t("nav.signOut")}
          </button>
        </div>
      </div>
    </aside>
  );
}
