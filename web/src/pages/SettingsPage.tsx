import {
  ArrowLeft,
  AtSign,
  Loader2,
  LogOut,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useSession } from "../App";
import LanguageToggle from "../components/LanguageToggle";
import AccountPanel from "../components/settings/AccountPanel";
import AiPanel from "../components/settings/AiPanel";
import AttachmentPanel from "../components/settings/AttachmentPanel";
import MailboxesPanel from "../components/settings/MailboxesPanel";
import ProvidersPanel from "../components/settings/ProvidersPanel";
import UpdatePanel from "../components/settings/UpdatePanel";
import ThemeToggle from "../components/ThemeToggle";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/dict";
import type { Mailbox, ProviderView } from "../lib/api";
import { api } from "../lib/api";

type Category = "providers" | "ai" | "update" | "attachments" | "mailboxes" | "account";

const CATEGORIES: Array<{ key: Category; labelKey: TranslationKey; icon: typeof Send; adminOnly?: boolean }> =
  [
    { key: "providers", labelKey: "settings.nav.providers", icon: Send, adminOnly: true },
    { key: "ai", labelKey: "settings.nav.ai", icon: Sparkles, adminOnly: true },
    { key: "update", labelKey: "settings.nav.update", icon: RefreshCw, adminOnly: true },
    { key: "attachments", labelKey: "settings.nav.attachments", icon: Paperclip },
    { key: "mailboxes", labelKey: "settings.nav.mailboxes", icon: AtSign },
    { key: "account", labelKey: "settings.nav.account", icon: UserIcon },
  ];

export default function SettingsPage() {
  const { user, refresh, signOut } = useSession();
  const { t } = useI18n();
  const isAdmin = user.role === "admin";

  const visible = CATEGORIES.filter((item) => !item.adminOnly || isAdmin);
  // 二级目录路由驱动：/settings/:category，无效或不可见的回退到第一个可见 tab
  const { category: categoryParam } = useParams<{ category: string }>();
  const category: Category = visible.some((item) => item.key === categoryParam)
    ? (categoryParam as Category)
    : (visible[0]?.key ?? "account");
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

  return (
    <div className="settings-shell">
      <aside className="sidebar">
        <Link className="btn btn--secondary btn--block back-btn" to="/">
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
          <div className="user-card">
            <span className="user-card__avatar">
              {(user.name || user.email).trim()[0]?.toUpperCase() ?? "?"}
            </span>
            <div className="user-card__meta">
              <span className="user-card__name">{user.name || user.email}</span>
              {user.name && <span className="user-card__email">{user.email}</span>}
            </div>
          </div>
          <div className="sidebar__footer-row">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          <button
            className="btn btn--ghost btn--block sidebar__logout"
            type="button"
            onClick={() => void signOut()}
          >
            <LogOut size={14} />
            {t("nav.signOut")}
          </button>
        </div>
      </aside>

      <main className="settings-main">
        {loading ? (
          <div className="empty">
            <Loader2 size={20} className="spin" />
            <p>{t("list.loading")}</p>
          </div>
        ) : loadError ? (
          <div className="empty">
            <p>{t("list.loadError")}</p>
            <button className="btn btn--secondary btn--sm" type="button" onClick={() => void load()}>
              {t("common.refresh")}
            </button>
          </div>
        ) : category === "providers" ? (
          <ProvidersPanel providers={providers} mailboxes={mailboxes} onChanged={() => void load()} />
        ) : category === "ai" ? (
          <AiPanel />
        ) : category === "update" ? (
          <UpdatePanel />
        ) : category === "attachments" ? (
          <AttachmentPanel />
        ) : category === "mailboxes" ? (
          <MailboxesPanel mailboxes={mailboxes} onChanged={() => void reloadAll()} />
        ) : (
          <AccountPanel user={user} />
        )}
      </main>
    </div>
  );
}
