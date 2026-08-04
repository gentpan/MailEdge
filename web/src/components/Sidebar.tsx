import {
  Archive,
  AtSign,
  ChevronDown,
  ChevronUp,
  ContactRound,
  Folder,
  FolderPlus,
  GripVertical,
  Inbox,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Paperclip,
  PenSquare,
  Rows3,
  Rows4,
  Send,
  SendHorizontal,
  Settings,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { type DragEvent, type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { CustomFolder, FolderStats, MailFolder } from "../../../src/shared/message";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import type { Mailbox, User } from "../lib/api";
import LanguageToggle from "./LanguageToggle";
import Logo from "./Logo";
import type { MessageListStyle } from "./MessageList";
import ThemeToggle from "./ThemeToggle";

export type MailView = "mail" | "outbox" | "attachments" | "contacts" | "dashboard";

/** 头像用的首字母：优先取名字，退到邮箱首字符 */
function initial(value: string): string {
  return (value.trim()[0] ?? "?").toUpperCase();
}

type NavIcon = LucideIcon;

const FOLDERS: Array<{ key: MailFolder; labelKey: TranslationKey; icon: NavIcon }> = [
  { key: "inbox", labelKey: "folder.inbox", icon: Inbox },
  { key: "sent", labelKey: "folder.sent", icon: Send },
  { key: "archive", labelKey: "folder.archive", icon: Archive },
  { key: "spam", labelKey: "folder.spam", icon: TriangleAlert },
  { key: "trash", labelKey: "folder.trash", icon: Trash2 },
];

type SidebarOrderGroup = "primary" | "mailboxes" | "folders" | "delivery" | "management";
type SidebarOrders = Record<SidebarOrderGroup, string[]>;

const DEFAULT_SIDEBAR_ORDERS: SidebarOrders = {
  primary: ["view:dashboard"],
  mailboxes: [],
  folders: FOLDERS.map((folder) => `folder:${folder.key}`),
  delivery: ["view:outbox", "view:attachments"],
  management: ["view:contacts"],
};

function sidebarStorageKey(userId: string): string {
  return `mailedge-sidebar-order:${userId}`;
}

function loadSidebarOrders(userId: string): SidebarOrders {
  try {
    const raw = localStorage.getItem(sidebarStorageKey(userId));
    if (!raw) return DEFAULT_SIDEBAR_ORDERS;
    const parsed = JSON.parse(raw) as Partial<SidebarOrders>;
    return {
      primary: Array.isArray(parsed.primary)
        ? parsed.primary.filter((id): id is string => typeof id === "string")
        : DEFAULT_SIDEBAR_ORDERS.primary,
      mailboxes: Array.isArray(parsed.mailboxes)
        ? parsed.mailboxes.filter((id): id is string => typeof id === "string")
        : [],
      folders: Array.isArray(parsed.folders)
        ? parsed.folders.filter((id): id is string => typeof id === "string")
        : DEFAULT_SIDEBAR_ORDERS.folders,
      delivery: Array.isArray(parsed.delivery)
        ? parsed.delivery.filter((id): id is string => typeof id === "string")
        : DEFAULT_SIDEBAR_ORDERS.delivery,
      management: Array.isArray(parsed.management)
        ? parsed.management.filter((id): id is string => typeof id === "string")
        : DEFAULT_SIDEBAR_ORDERS.management,
    };
  } catch {
    return DEFAULT_SIDEBAR_ORDERS;
  }
}

function orderedIds(currentIds: string[], savedIds: string[]): string[] {
  const current = new Set(currentIds);
  return [...savedIds.filter((id) => current.has(id)), ...currentIds.filter((id) => !savedIds.includes(id))];
}

interface SortableNavItemProps {
  id: string;
  group: SidebarOrderGroup;
  icon: NavIcon;
  active?: boolean;
  title?: string;
  onClick: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, group: SidebarOrderGroup, id: string) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>, group: SidebarOrderGroup, id: string) => void;
  onDragEnd: () => void;
  dragging: boolean;
  children: ReactNode;
}

function SortableNavItem({
  id,
  group,
  icon: Icon,
  active = false,
  title,
  onClick,
  onDragStart,
  onDrop,
  onDragEnd,
  dragging,
  children,
}: SortableNavItemProps) {
  return (
    <div className={`sidebar__sortable-item${dragging ? " sidebar__sortable-item--dragging" : ""}`}>
      <button
        type="button"
        className={`nav-item${active ? " nav-item--active" : ""}`}
        draggable
        aria-grabbed={dragging}
        title={title}
        onClick={onClick}
        onDragStart={(event) => onDragStart(event, group, id)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => onDrop(event, group, id)}
      >
        <GripVertical className="nav-item__drag-handle" size={12} aria-hidden="true" />
        <Icon size={16} />
        {children}
      </button>
    </div>
  );
}

interface Props {
  user: User;
  mailboxes: Mailbox[];
  activeMailboxId: string | undefined;
  activeFolder: MailFolder;
  view: MailView;
  stats: FolderStats[];
  customFolders: CustomFolder[];
  onSelectMailbox: (id: string) => void;
  onSelectFolder: (folder: MailFolder) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onSelectView: (view: MailView) => void;
  onCompose: () => void;
  onSignOut: () => void;
  messageListStyle: MessageListStyle;
  onToggleMessageListStyle: () => void;
}

export default function Sidebar({
  user,
  mailboxes,
  activeMailboxId,
  activeFolder,
  view,
  stats,
  customFolders,
  onSelectMailbox,
  onSelectFolder,
  onCreateFolder,
  onSelectView,
  onCompose,
  onSignOut,
  messageListStyle,
  onToggleMessageListStyle,
}: Props) {
  const { t } = useI18n();
  const [accountOpen, setAccountOpen] = useState(false);
  const [folderComposerOpen, setFolderComposerOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [sidebarOrders, setSidebarOrders] = useState<SidebarOrders>(() => loadSidebarOrders(user.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !userMenuRef.current?.contains(target)) {
        setAccountOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);
  const unreadOf = (folder: MailFolder) => stats.find((item) => item.folder === folder)?.unread ?? 0;
  const ListStyleIcon = messageListStyle === "compact" ? Rows3 : Rows4;

  const mailboxIds = [...mailboxes.map((mailbox) => `mailbox:${mailbox.id}`)];
  const primaryIds = DEFAULT_SIDEBAR_ORDERS.primary;
  const folderIds = [
    ...FOLDERS.map((folder) => `folder:${folder.key}`),
    ...customFolders.map((folder) => `folder:${folder.id}`),
  ];
  const deliveryIds = DEFAULT_SIDEBAR_ORDERS.delivery;
  const managementIds = DEFAULT_SIDEBAR_ORDERS.management;

  // 新建信箱/文件夹后，把新入口追加到保存的顺序末尾；已删除的入口自动清理。
  useEffect(() => {
    const mailboxIdsForOrder = [...mailboxes.map((mailbox) => `mailbox:${mailbox.id}`)];
    const folderIdsForOrder = [
      ...FOLDERS.map((folder) => `folder:${folder.key}`),
      ...customFolders.map((folder) => `folder:${folder.id}`),
    ];
    setSidebarOrders((current) => {
      const next: SidebarOrders = {
        primary: orderedIds(primaryIds, current.primary),
        mailboxes: orderedIds(mailboxIdsForOrder, current.mailboxes),
        folders: orderedIds(folderIdsForOrder, current.folders),
        delivery: orderedIds(deliveryIds, current.delivery),
        management: orderedIds(managementIds, current.management),
      };
      const changed = (Object.keys(next) as SidebarOrderGroup[]).some(
        (group) => next[group].join("\u0000") !== current[group].join("\u0000"),
      );
      return changed ? next : current;
    });
  }, [mailboxes, customFolders]);

  useEffect(() => {
    try {
      localStorage.setItem(sidebarStorageKey(user.id), JSON.stringify(sidebarOrders));
    } catch {
      // 隐私模式或禁用存储时仍保持当前页面的拖动顺序。
    }
  }, [sidebarOrders, user.id]);

  function onDragStart(event: DragEvent<HTMLButtonElement>, group: SidebarOrderGroup, id: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/sidebar-order", `${group}|${id}`);
    setDraggingId(`${group}|${id}`);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>, group: SidebarOrderGroup, targetId: string) {
    event.preventDefault();
    const value = event.dataTransfer.getData("text/sidebar-order");
    const separator = value.indexOf("|");
    const sourceGroup = separator >= 0 ? value.slice(0, separator) : "";
    const sourceId = separator >= 0 ? value.slice(separator + 1) : "";
    setDraggingId(null);
    // 只在同一分组内排序，避免把“信箱入口”误拖成文件夹或投递入口。
    if (sourceGroup !== group || !sourceId || sourceId === targetId) return;
    setSidebarOrders((current) => {
      const ids = [...current[group]];
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      ids.splice(from, 1);
      ids.splice(to, 0, sourceId);
      return { ...current, [group]: ids };
    });
  }

  function onDragEnd() {
    setDraggingId(null);
  }

  async function submitFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || folderSaving) return;
    setFolderSaving(true);
    setFolderError(null);
    try {
      await onCreateFolder(name);
      setFolderName("");
      setFolderComposerOpen(false);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "创建失败");
    } finally {
      setFolderSaving(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Logo size={30} variant="blue" />
        <span className="sidebar__brand-name">{t("app.name")}</span>
      </div>

      <button className="btn" type="button" onClick={onCompose}>
        <PenSquare size={16} />
        {t("nav.compose")}
      </button>

      <nav className="sidebar__section">
        {orderedIds(primaryIds, sidebarOrders.primary).map((id) => (
          <SortableNavItem
            key={id}
            id={id}
            group="primary"
            icon={LayoutDashboard}
            active={view === "dashboard"}
            onClick={() => onSelectView("dashboard")}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            dragging={draggingId === `primary|${id}`}
          >
            {t("nav.dashboard")}
          </SortableNavItem>
        ))}
      </nav>

      <div className="sidebar__folder-heading">
        <span className="sidebar__label">{t("nav.folders")}</span>
        <button
          className="sidebar__folder-add"
          type="button"
          title={t("folder.create")}
          aria-label={t("folder.create")}
          aria-expanded={folderComposerOpen}
          onClick={() => {
            setFolderComposerOpen((open) => !open);
            setFolderError(null);
          }}
        >
          <FolderPlus size={15} />
        </button>
      </div>

      {folderComposerOpen && (
        <form className="sidebar__folder-form" onSubmit={(event) => void submitFolder(event)}>
          <input
            className="input"
            value={folderName}
            maxLength={40}
            placeholder={t("folder.name.placeholder")}
            aria-label={t("folder.name")}
            onChange={(event) => setFolderName(event.target.value)}
          />
          <button className="btn btn--sm" type="submit" disabled={folderSaving || !folderName.trim()}>
            {folderSaving ? t("common.saving") : t("common.create")}
          </button>
          {folderError && <span className="sidebar__folder-error">{folderError}</span>}
        </form>
      )}

      <nav className="sidebar__section">
        {orderedIds(folderIds, sidebarOrders.folders).map((orderId) => {
          const systemFolder = FOLDERS.find((folder) => `folder:${folder.key}` === orderId);
          if (systemFolder) {
            const unread = unreadOf(systemFolder.key);
            const active =
              view === "mail" &&
              activeFolder === systemFolder.key &&
              (systemFolder.key !== "inbox" || activeMailboxId === "all" || mailboxes.length <= 1);
            return (
              <SortableNavItem
                key={orderId}
                id={orderId}
                group="folders"
                icon={systemFolder.icon}
                active={active}
                onClick={() =>
                  systemFolder.key === "inbox" ? onSelectMailbox("all") : onSelectFolder(systemFolder.key)
                }
                onDragStart={onDragStart}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                dragging={draggingId === `folders|${orderId}`}
              >
                {t(systemFolder.labelKey)}
                {unread > 0 && <span className="nav-item__count">{unread}</span>}
              </SortableNavItem>
            );
          }
          const customFolder = customFolders.find((folder) => `folder:${folder.id}` === orderId);
          if (!customFolder) return null;
          const unread = unreadOf(customFolder.id);
          const active = view === "mail" && activeFolder === customFolder.id;
          return (
            <SortableNavItem
              key={orderId}
              id={orderId}
              group="folders"
              icon={Folder}
              active={active}
              title={customFolder.name}
              onClick={() => onSelectFolder(customFolder.id)}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              dragging={draggingId === `folders|${orderId}`}
            >
              <span className="nav-item__text">{customFolder.name}</span>
              {unread > 0 && <span className="nav-item__count">{unread}</span>}
            </SortableNavItem>
          );
        })}
      </nav>

      <nav className="sidebar__section">
        <span className="sidebar__label">{t("nav.delivery")}</span>
        {orderedIds(deliveryIds, sidebarOrders.delivery).map((id) => {
          const item =
            id === "view:outbox"
              ? { view: "outbox" as const, icon: SendHorizontal, label: "nav.outbox" as const }
              : id === "view:attachments"
                ? { view: "attachments" as const, icon: Paperclip, label: "nav.attachments" as const }
                : { view: "contacts" as const, icon: ContactRound, label: "nav.contacts" as const };
          return (
            <SortableNavItem
              key={id}
              id={id}
              group="delivery"
              icon={item.icon}
              active={view === item.view}
              onClick={() => onSelectView(item.view)}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              dragging={draggingId === `delivery|${id}`}
            >
              {t(item.label)}
            </SortableNavItem>
          );
        })}
      </nav>

      <nav className="sidebar__section">
        <span className="sidebar__label">{t("nav.management")}</span>
        {orderedIds(managementIds, sidebarOrders.management).map((id) => (
          <SortableNavItem
            key={id}
            id={id}
            group="management"
            icon={ContactRound}
            active={view === "contacts"}
            onClick={() => onSelectView("contacts")}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            dragging={draggingId === `management|${id}`}
          >
            {t("nav.contacts")}
          </SortableNavItem>
        ))}
      </nav>

      {mailboxes.length > 0 && (
        <div className="sidebar__section">
          <span className="sidebar__label">{t("nav.mailboxes")}</span>
          {orderedIds(mailboxIds, sidebarOrders.mailboxes).map((orderId) => {
            const mailbox = mailboxes.find((item) => `mailbox:${item.id}` === orderId);
            if (!mailbox) return null;
            return (
              <SortableNavItem
                key={orderId}
                id={orderId}
                group="mailboxes"
                icon={AtSign}
                active={activeMailboxId === mailbox.id}
                title={mailbox.address}
                onClick={() => onSelectMailbox(mailbox.id)}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                dragging={draggingId === `mailboxes|${orderId}`}
              >
                <span className="nav-item__mailbox-meta">
                  <span className="nav-item__text">{mailbox.displayName || mailbox.address}</span>
                  {mailbox.displayName && (
                    <span className="nav-item__mailbox-address">{mailbox.address}</span>
                  )}
                </span>
              </SortableNavItem>
            );
          })}
        </div>
      )}

      <div className="sidebar__footer">
        <div className="user-menu" ref={userMenuRef}>
          <button
            className="user-card"
            type="button"
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            onClick={() => setAccountOpen((open) => !open)}
          >
            <span className="user-card__avatar">{initial(user.name || user.email)}</span>
            <span className="user-card__meta">
              <span className="user-card__name">{user.name || user.email}</span>
              {user.name && <span className="user-card__email">{user.email}</span>}
            </span>
            {accountOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>

          {accountOpen && (
            <div className="user-menu__panel" role="menu">
              <div className="user-menu__identity">
                <span className="user-card__avatar">{initial(user.name || user.email)}</span>
                <span>{user.email}</span>
              </div>
              <Link
                className="user-menu__item"
                to="/settings"
                role="menuitem"
                onClick={() => setAccountOpen(false)}
              >
                <Settings size={16} />
                {t("nav.settings")}
              </Link>
              <button
                className="user-menu__item user-menu__item--danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
              >
                <LogOut size={16} />
                {t("nav.signOut")}
              </button>
            </div>
          )}
        </div>

        <div className="sidebar__footer-row">
          <LanguageToggle />
          <button
            type="button"
            className="btn btn--ghost btn--sm sidebar__list-style-toggle"
            onClick={onToggleMessageListStyle}
            title={messageListStyle === "compact" ? "切换为舒适列表" : "切换为紧凑列表"}
            aria-label={messageListStyle === "compact" ? "切换为舒适列表" : "切换为紧凑列表"}
            aria-pressed={messageListStyle === "compact"}
          >
            <ListStyleIcon size={14} />
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
