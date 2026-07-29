import { useCallback, useEffect, useState } from "react";
import { useSession } from "../App";
import ComposeModal from "../components/ComposeModal";
import type { ComposeDraft } from "../components/ComposeModal";
import MessageList from "../components/MessageList";
import MessageView from "../components/MessageView";
import OutboxView from "../components/OutboxView";
import SharesView from "../components/SharesView";
import Sidebar from "../components/Sidebar";
import type { MailView } from "../components/Sidebar";
import type { FolderStats, MailFolder, MessageDetail, MessageSummary } from "../../../src/shared/message";
import { api } from "../lib/api";
import type { ProviderView, SendResponse } from "../lib/api";
import { useI18n } from "../i18n";

export default function MailPage() {
  const { user, mailboxes, signOut } = useSession();
  const { t } = useI18n();

  // 多个信箱时默认聚合视图，单个信箱就直接用它
  const [mailboxId, setMailboxId] = useState(mailboxes.length > 1 ? "all" : mailboxes[0]?.id);
  // 聚合视图下每封信可能来自不同信箱，操作要按邮件自身的信箱路由
  const [detailMailboxId, setDetailMailboxId] = useState<string | undefined>(undefined);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [category, setCategory] = useState<string>("");
  const [view, setView] = useState<MailView>("mail");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<FolderStats[]>([]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadList = useCallback(
    async (options: { append?: boolean; before?: string } = {}) => {
      setListLoading(true);
      try {
        const result = await api.messages({
          mailboxId,
          folder,
          category: category || undefined,
          q: search || undefined,
          before: options.before,
        });
        setItems((previous) => (options.append ? [...previous, ...result.items] : result.items));
        setCursor(result.nextCursor);
      } finally {
        setListLoading(false);
      }
    },
    [mailboxId, folder, category, search],
  );

  const loadStats = useCallback(async () => {
    const result = await api.stats(mailboxId);
    setStats(result.stats);
  }, [mailboxId]);

  useEffect(() => {
    setActiveId(null);
    setDetail(null);
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    api
      .providers()
      .then((result) => setProviders(result.providers))
      .catch(() => setProviders([]));
    api
      .aiConfig()
      .then((result) => setAiEnabled(result.ai.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function openMessage(message: MessageSummary) {
    const owner = message.mailboxId ?? mailboxId;
    setActiveId(message.id);
    setDetailMailboxId(owner);
    setDetailLoading(true);
    try {
      const result = await api.message(message.id, owner);
      setDetail(result.message);
      setItems((previous) =>
        previous.map((item) => (item.id === message.id ? { ...item, isRead: true } : item)),
      );
      void loadStats();
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveTo(id: string, target: MailFolder) {
    await api.patchMessage(id, { folder: target }, detailMailboxId ?? mailboxId);
    setItems((previous) => previous.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setDetail(null);
    }
    void loadStats();
  }

  async function removeMessage(id: string) {
    await api.deleteMessage(id, detailMailboxId ?? mailboxId);
    setItems((previous) => previous.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setDetail(null);
    }
    void loadStats();
  }

  async function toggleStar(message: MessageDetail) {
    const next = !message.isStarred;
    await api.patchMessage(message.id, { isStarred: next }, detailMailboxId ?? mailboxId);
    setDetail({ ...message, isStarred: next });
    setItems((previous) =>
      previous.map((item) => (item.id === message.id ? { ...item, isStarred: next } : item)),
    );
  }

  function replyTo(message: MessageDetail) {
    setComposeDraft({
      to: message.from.email,
      subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`,
      text: `\n\n${t("reply.quote", { from: message.from.email })}${message.text ?? ""}`,
    });
  }

  function onSent(result: SendResponse) {
    setComposeDraft(null);
    const shared = result.smartAttachments.shared.length;
    if (result.status === "sent") {
      setToast(shared ? t("toast.sentShared", { n: shared }) : t("toast.sent"));
    } else if (result.status === "deferred") {
      setToast(t("toast.deferred"));
    } else {
      setToast(t("toast.sendFailed", { error: result.error ?? "unknown" }));
    }
    if (folder === "sent") void loadList();
    void loadStats();
  }

  return (
    <div className={`shell${detail && view === "mail" ? " shell--detail" : ""}`}>
      <Sidebar
        user={user}
        mailboxes={mailboxes}
        activeMailboxId={mailboxId}
        activeFolder={folder}
        view={view}
        stats={stats}
        onSelectMailbox={setMailboxId}
        onSelectFolder={(next) => {
          setView("mail");
          setFolder(next);
          setCategory("");
        }}
        onSelectView={setView}
        onCompose={() => setComposeDraft({})}
        onSignOut={() => void signOut()}
      />

      {view === "outbox" ? (
        <OutboxView />
      ) : view === "shares" ? (
        <SharesView />
      ) : (
        <>
          <MessageList
            items={items}
            loading={listLoading}
            activeId={activeId}
            search={search}
            folder={folder}
            showMailbox={mailboxId === "all"}
            category={category}
            showCategories={aiEnabled && (folder === "inbox" || folder === "catchall")}
            onSelectCategory={setCategory}
            onSearch={setSearch}
            onSelect={(message) => void openMessage(message)}
            onLoadMore={() => void loadList({ append: true, before: cursor ?? undefined })}
            hasMore={Boolean(cursor)}
          />

          <MessageView
            message={detail}
            loading={detailLoading}
            mailboxId={detailMailboxId}
            aiEnabled={aiEnabled}
            onReply={replyTo}
            onAiReply={(draft) => setComposeDraft(draft)}
            onArchive={(id) => void moveTo(id, "archive")}
            onDelete={(id) => void removeMessage(id)}
            onToggleStar={(message) => void toggleStar(message)}
          />
        </>
      )}

      {composeDraft && (
        <ComposeModal
          mailboxes={mailboxes}
          providers={providers}
          isAdmin={user.role === "admin"}
          draft={composeDraft}
          onClose={() => setComposeDraft(null)}
          onSent={onSent}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
