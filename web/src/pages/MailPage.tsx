import { useCallback, useEffect, useRef, useState } from "react";
import type { FolderStats, MailFolder, MessageDetail, MessageSummary } from "../../../src/shared/message";
import { useSession } from "../App";
import type { ComposeDraft } from "../components/ComposeModal";
import ComposeModal from "../components/ComposeModal";
import MessageList from "../components/MessageList";
import MessageView from "../components/MessageView";
import OutboxView from "../components/OutboxView";
import SharesView from "../components/SharesView";
import type { MailView } from "../components/Sidebar";
import Sidebar from "../components/Sidebar";
import { useI18n } from "../i18n";
import type { ProviderView, SendResponse } from "../lib/api";
import { api } from "../lib/api";
import { useMailStream } from "../lib/useMailStream";

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

  // 竞态守卫：列表与详情的请求可能交错返回，用自增序号只接受最后一次的结果
  const listSeqRef = useRef(0);
  const detailSeqRef = useRef(0);

  const loadList = useCallback(
    async (options: { append?: boolean; before?: string } = {}) => {
      const seq = ++listSeqRef.current;
      setListLoading(true);
      try {
        const result = await api.messages({
          mailboxId,
          folder,
          category: category || undefined,
          q: search || undefined,
          before: options.before,
        });
        if (seq !== listSeqRef.current) return; // 已有更新的请求，丢弃过期响应
        setItems((previous) => (options.append ? [...previous, ...result.items] : result.items));
        setCursor(result.nextCursor);
      } catch {
        // 列表加载失败静默：下一次轮询/事件会再试
      } finally {
        if (seq === listSeqRef.current) setListLoading(false);
      }
    },
    [mailboxId, folder, category, search],
  );

  const loadStats = useCallback(async () => {
    try {
      const result = await api.stats(mailboxId);
      setStats(result.stats);
    } catch {
      // 未读数失败静默，不影响主流程
    }
  }, [mailboxId]);

  // 列表刷新统一防抖：敲键盘/切文件夹时不立刻连发请求
  useEffect(() => {
    setActiveId(null);
    setDetail(null);
    const timer = window.setTimeout(() => void loadList(), 300);
    return () => window.clearTimeout(timer);
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

  // 实时推送：连到当前视图涉及的信箱 DO，收信/变动秒级到达。
  // 事件可能连发（如批量收信），用防抖合并成一次刷新，避免风暴式轰炸 API
  const streamTimerRef = useRef<number | null>(null);
  const streamIds = mailboxId === "all" ? mailboxes.map((m) => m.id) : mailboxId ? [mailboxId] : [];
  useMailStream(view === "mail" ? streamIds : [], () => {
    if (streamTimerRef.current) window.clearTimeout(streamTimerRef.current);
    streamTimerRef.current = window.setTimeout(() => {
      streamTimerRef.current = null;
      void loadStats();
      void loadList();
    }, 500);
  });

  useEffect(
    () => () => {
      if (streamTimerRef.current) window.clearTimeout(streamTimerRef.current);
    },
    [],
  );

  // 轮询兜底：WebSocket 断线期间每 60 秒查一次未读数，变化了才静默刷新；
  // 标签页隐藏时跳过。不会打断阅读——刷新只替换列表，已打开的邮件详情不受影响。
  const statsSigRef = useRef("");
  useEffect(() => {
    if (view !== "mail") return;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const result = await api.stats(mailboxId);
        const sig = JSON.stringify(result.stats);
        setStats(result.stats);
        if (statsSigRef.current && sig !== statsSigRef.current) {
          await loadList();
        }
        statsSigRef.current = sig;
      } catch {
        // 忽略轮询期间的偶发失败
      }
    };
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [view, mailboxId, loadList]);

  async function openMessage(message: MessageSummary) {
    const owner = message.mailboxId ?? mailboxId;
    const seq = ++detailSeqRef.current;
    setActiveId(message.id);
    setDetailMailboxId(owner);
    setDetailLoading(true);
    try {
      const result = await api.message(message.id, owner);
      if (seq !== detailSeqRef.current) return; // 用户已切到别的邮件，丢弃过期详情
      setDetail(result.message);
      setItems((previous) =>
        previous.map((item) => (item.id === message.id ? { ...item, isRead: true } : item)),
      );
      void loadStats();
    } finally {
      if (seq === detailSeqRef.current) setDetailLoading(false);
    }
  }

  async function moveTo(id: string, target: MailFolder) {
    try {
      await api.patchMessage(id, { folder: target }, detailMailboxId ?? mailboxId);
    } catch {
      setToast(t("toast.actionFailed"));
      return;
    }
    setItems((previous) => previous.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setDetail(null);
    }
    void loadStats();
  }

  async function removeMessage(id: string) {
    try {
      await api.deleteMessage(id, detailMailboxId ?? mailboxId);
    } catch {
      setToast(t("toast.actionFailed"));
      return;
    }
    setItems((previous) => previous.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setDetail(null);
    }
    void loadStats();
  }

  async function toggleStar(message: MessageDetail) {
    const next = !message.isStarred;
    try {
      await api.patchMessage(message.id, { isStarred: next }, detailMailboxId ?? mailboxId);
    } catch {
      setToast(t("toast.actionFailed"));
      return;
    }
    setDetail({ ...message, isStarred: next });
    setItems((previous) =>
      previous.map((item) => (item.id === message.id ? { ...item, isStarred: next } : item)),
    );
  }

  function replyTo(message: MessageDetail) {
    // 回复时发件人自动用「收到信的那个地址」（所属信箱），
    // 对方看到的就是给你发信时用的地址，而不是默认发信地址
    const mailbox = mailboxes.find((m) => m.id === detailMailboxId);
    const from = mailbox?.address ?? message.to[0]?.email;
    setComposeDraft({
      from,
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
