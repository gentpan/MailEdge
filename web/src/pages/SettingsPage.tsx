import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AtSign, Loader2, Send, User as UserIcon } from "lucide-react";
import { useSession } from "../App";
import AccountPanel from "../components/settings/AccountPanel";
import MailboxesPanel from "../components/settings/MailboxesPanel";
import ProvidersPanel from "../components/settings/ProvidersPanel";
import { api } from "../lib/api";
import type { Mailbox, ProviderView } from "../lib/api";

type Category = "providers" | "mailboxes" | "account";

const CATEGORIES: Array<{ key: Category; label: string; icon: typeof Send; adminOnly?: boolean }> = [
  { key: "providers", label: "发信服务", icon: Send, adminOnly: true },
  { key: "mailboxes", label: "收件地址", icon: AtSign },
  { key: "account", label: "账户", icon: UserIcon },
];

export default function SettingsPage() {
  const { user, refresh } = useSession();
  const isAdmin = user.role === "admin";

  const visible = CATEGORIES.filter((item) => !item.adminOnly || isAdmin);
  const [category, setCategory] = useState<Category>(visible[0]?.key ?? "account");
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [providerResult, mailboxResult] = await Promise.all([api.providers(), api.mailboxes()]);
    setProviders(providerResult.providers);
    setMailboxes(mailboxResult.mailboxes);
    setLoading(false);
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
        <Link className="nav-item" to="/">
          <ArrowLeft size={16} />
          返回邮箱
        </Link>

        <nav className="sidebar__section">
          <span className="sidebar__label">设置</span>
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={`nav-item${category === item.key ? " nav-item--active" : ""}`}
                onClick={() => setCategory(item.key)}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__user">{user.name || user.email}</span>
        </div>
      </aside>

      <main className="settings-main">
        {loading ? (
          <div className="empty">
            <Loader2 size={20} className="spin" />
            <p>加载中…</p>
          </div>
        ) : category === "providers" ? (
          <ProvidersPanel providers={providers} mailboxes={mailboxes} onChanged={() => void load()} />
        ) : category === "mailboxes" ? (
          <MailboxesPanel mailboxes={mailboxes} onChanged={() => void reloadAll()} />
        ) : (
          <AccountPanel user={user} />
        )}
      </main>
    </div>
  );
}
