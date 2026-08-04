import {
  ArrowLeft,
  AtSign,
  Bell,
  ChevronDown,
  ChevronUp,
  Copyright,
  Database,
  Loader2,
  LogOut,
  RefreshCw,
  Rows3,
  Rows4,
  Send,
  Settings,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useSession } from "../App";
import LanguageToggle from "../components/LanguageToggle";
import LegalOverview from "../components/LegalOverview";
import type { MessageListStyle } from "../components/MessageList";
import AccountPanel from "../components/settings/AccountPanel";
import AiPanel from "../components/settings/AiPanel";
import MailboxesPanel from "../components/settings/MailboxesPanel";
import ProvidersPanel from "../components/settings/ProvidersPanel";
import SettingsPanel from "../components/settings/SettingsPanel";
import SettingsToastProvider from "../components/settings/SettingsToast";
import StoragePanel from "../components/settings/StoragePanel";
import TelegramPanel from "../components/settings/TelegramPanel";
import UpdatePanel from "../components/settings/UpdatePanel";
import ThemeToggle from "../components/ThemeToggle";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import type { Mailbox, ProviderView } from "../lib/api";
import { api } from "../lib/api";

type Category =
  | "providers"
  | "ai"
  | "notifications"
  | "update"
  | "storage"
  | "mailboxes"
  | "account"
  | "legal";

const CATEGORIES: Array<{ key: Category; labelKey: TranslationKey; icon: typeof Send; adminOnly?: boolean }> =
  [
    { key: "providers", labelKey: "settings.nav.providers", icon: Send, adminOnly: true },
    { key: "ai", labelKey: "settings.nav.ai", icon: Sparkles, adminOnly: true },
    { key: "notifications", labelKey: "settings.nav.notifications", icon: Bell, adminOnly: true },
    { key: "update", labelKey: "settings.nav.update", icon: RefreshCw, adminOnly: true },
    { key: "storage", labelKey: "settings.nav.storage", icon: Database, adminOnly: true },
    { key: "mailboxes", labelKey: "settings.nav.mailboxes", icon: AtSign },
    { key: "account", labelKey: "settings.nav.account", icon: UserIcon },
    { key: "legal", labelKey: "settings.nav.legal", icon: Copyright },
  ];

export default function SettingsPage() {
  const { user, refresh, signOut } = useSession();
  const { t } = useI18n();
  const isAdmin = user.role === "admin";
  const [accountOpen, setAccountOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [messageListStyle, setMessageListStyle] = useState<MessageListStyle>(() => {
    try {
      return localStorage.getItem("mailedge-message-list-style-v2") === "comfortable"
        ? "comfortable"
        : "compact";
    } catch {
      return "compact";
    }
  });

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

  const visible = CATEGORIES.filter((item) => !item.adminOnly || isAdmin);
  // 二级目录路由驱动：/settings/:category，无效或不可见的回退到第一个可见 tab
  const { category: categoryParam } = useParams<{ category: string }>();
  const category: Category = visible.some((item) => item.key === categoryParam)
    ? (categoryParam as Category)
    : (visible[0]?.key ?? "account");
  const categoryTitle = t(visible.find((item) => item.key === category)?.labelKey ?? "settings.nav.account");
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [providerResult, mailboxResult] = await Promise.all([api.providers(), api.mailboxes()]);
      setProviders(providerResult.providers);
      setMailboxes(mailboxResult.mailboxes);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadAll = useCallback(async () => {
    await load();
    await refresh();
  }, [load, refresh]);

  function toggleMessageListStyle() {
    setMessageListStyle((current) => {
      const next = current === "compact" ? "comfortable" : "compact";
      try {
        localStorage.setItem("mailedge-message-list-style-v2", next);
      } catch {
        // 隐私模式下无法持久化时仍保留本次页面切换
      }
      return next;
    });
  }

  const ListStyleIcon = messageListStyle === "compact" ? Rows3 : Rows4;

  return (
    <SettingsToastProvider>
      <div className="settings-shell">
        <aside className="sidebar">
          <Link className="btn btn--secondary btn--block back-btn" to="/dashboard">
            <ArrowLeft size={16} />
            {t("settings.back")}
          </Link>

          <nav className="sidebar__section settings-nav">
            <span className="sidebar__label">{t("settings.title")}</span>
            {visible.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={`/settings/${item.key}`}
                  className={`nav-item settings-nav__item${category === item.key ? " nav-item--active" : ""}`}
                >
                  <Icon size={16} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar__footer">
            <div className="user-menu" ref={userMenuRef}>
              <button
                className="user-card"
                type="button"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((open) => !open)}
              >
                <span className="user-card__avatar">
                  {(user.name || user.email).trim()[0]?.toUpperCase() ?? "?"}
                </span>
                <span className="user-card__meta">
                  <span className="user-card__name">{user.name || user.email}</span>
                  {user.name && <span className="user-card__email">{user.email}</span>}
                </span>
                {accountOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>

              {accountOpen && (
                <div className="user-menu__panel" role="menu">
                  <div className="user-menu__identity">
                    <span className="user-card__avatar">
                      {(user.name || user.email).trim()[0]?.toUpperCase() ?? "?"}
                    </span>
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
                      void signOut();
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
                onClick={toggleMessageListStyle}
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

        <main className="settings-main">
          {loading ? (
            <SettingsPanel title={categoryTitle}>
              <div className="settings-loading" aria-live="polite">
                <Loader2 size={20} className="spin" />
                <span>{t("list.loading")}</span>
              </div>
            </SettingsPanel>
          ) : loadError ? (
            <SettingsPanel title={categoryTitle}>
              <div className="empty">
                <p>{t("list.loadError")}</p>
                <button className="btn btn--secondary btn--sm" type="button" onClick={() => void load()}>
                  {t("common.refresh")}
                </button>
              </div>
            </SettingsPanel>
          ) : category === "providers" ? (
            <ProvidersPanel providers={providers} mailboxes={mailboxes} onChanged={() => void load()} />
          ) : category === "ai" ? (
            <AiPanel />
          ) : category === "notifications" ? (
            <TelegramPanel />
          ) : category === "update" ? (
            <UpdatePanel />
          ) : category === "storage" ? (
            <StoragePanel />
          ) : category === "mailboxes" ? (
            <MailboxesPanel mailboxes={mailboxes} onChanged={() => void reloadAll()} />
          ) : category === "legal" ? (
            <div className="settings-panel settings-legal-panel">
              <LegalOverview className="legal-overview--embedded" />
            </div>
          ) : (
            <AccountPanel user={user} />
          )}
        </main>
      </div>
    </SettingsToastProvider>
  );
}
