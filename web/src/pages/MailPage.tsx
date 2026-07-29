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

export default function MailPage() {
  const { user, mailboxes, signOut } = useSession();

  // 多个信箱时默认聚合视图，单个信箱就直接用它
  const [mailboxId, setMailboxId] = useState(mailboxes.length > 1 ? "all" : mailboxes[0]?.id);
  // 聚合视图下每封信可能来自不同信箱，操作要按邮件自身的信箱路由
  const [detailMailboxId, setDetailMailboxId] = useState<string | undefined>(undefined);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [view, setView] = useState<MailView>("mail");
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
          q: search || undefined,
          before: options.before,
        });
        setItems((previous) => (options.append ? [...previous, ...result.items] : result.items));
        setCursor(result.nextCursor);
      } finally {
        setListLoading(false);
      }
    },
    [mailboxId, folder, search],
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
      text: `\n\n---- 原邮件 ----\n发件人：${message.from.email}\n${message.text ?? ""}`,
    });
  }

  function onSent(result: SendResponse) {
    setComposeDraft(null);
    const shared = result.smartAttachments.shared.length;
    if (result.status === "sent") {
      setToast(shared ? `已发送，其中 ${shared} 个大附件转为下载链接` : "已发送");
    } else if (result.status === "deferred") {
      setToast("所有渠道暂时不可用，已加入重试队列");
    } else {
      setToast(`发送失败：${result.error ?? "未知错误"}`);
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
            onSearch={setSearch}
            onSelect={(message) => void openMessage(message)}
            onLoadMore={() => void loadList({ append: true, before: cursor ?? undefined })}
            hasMore={Boolean(cursor)}
          />

          <MessageView
            message={detail}
            loading={detailLoading}
            onReply={replyTo}
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
