import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type {
  CustomFolder,
  FolderStats,
  MailFolder,
  MessageDetail,
  MessageSummary,
} from "../../../src/shared/message";
import { useSession } from "../App";
import AttachmentPanel from "../components/AttachmentPanel";
import type { ComposeDraft } from "../components/ComposeModal";
import ComposeModal from "../components/ComposeModal";
import ContactsView from "../components/ContactsView";
import MessageList, {
  MESSAGE_PAGE_SIZE_OPTIONS,
  type MessageListStyle,
  type MessagePageSize,
} from "../components/MessageList";
import MessageView from "../components/MessageView";
import OutboxView from "../components/OutboxView";
import type { MailView } from "../components/Sidebar";
import Sidebar from "../components/Sidebar";
import SettingsToastProvider from "../components/settings/SettingsToast";
import { useI18n } from "../i18n";
import type { Contact, ProviderView, SendResponse, StagedAttachment } from "../lib/api";
import { api } from "../lib/api";
import { displayName, formatDateTime } from "../lib/format";
import { useMailStream } from "../lib/useMailStream";

const DashboardView = lazy(() => import("../components/DashboardView"));

interface MailRouteState {
  view: MailView;
  folder: MailFolder;
  mailboxId?: string;
}

const SYSTEM_MAIL_ROUTES = new Set<MailFolder>(["inbox", "sent", "archive", "spam", "trash", "catchall"]);

function parseMailRoute(pathname: string, search: string): MailRouteState {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const mailboxId = new URLSearchParams(search).get("mailboxId") ?? undefined;
  const first = parts[0] ?? "dashboard";

  if (first === "dashboard") return { view: "dashboard", folder: "inbox", mailboxId };
  if (first === "outbox") return { view: "outbox", folder: "inbox", mailboxId };
  // 旧版本的附件链接地址继续可用，但统一进入附件管理。
  if (first === "shares") return { view: "attachments", folder: "inbox", mailboxId };
  if (first === "attachments") return { view: "attachments", folder: "inbox", mailboxId };
  if (first === "contacts") return { view: "contacts", folder: "inbox", mailboxId };
  if (first === "folder" && parts[1]) return { view: "mail", folder: parts[1], mailboxId };
  if (SYSTEM_MAIL_ROUTES.has(first as MailFolder)) {
    return { view: "mail", folder: first as MailFolder, mailboxId };
  }
  return { view: "dashboard", folder: "inbox", mailboxId };
}

function mailPath(view: MailView, folder: MailFolder, mailboxId?: string): string {
  const path =
    view === "dashboard"
      ? "/dashboard"
      : view === "outbox"
        ? "/outbox"
        : view === "attachments"
          ? "/attachments"
          : view === "contacts"
            ? "/contacts"
            : SYSTEM_MAIL_ROUTES.has(folder)
              ? `/${folder}`
              : `/folder/${encodeURIComponent(folder)}`;
  if (!mailboxId || mailboxId === "all") return path;
  return `${path}?mailboxId=${encodeURIComponent(mailboxId)}`;
}

export default function MailPage() {
  const { user, mailboxes, signOut } = useSession();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const initialRoute = parseMailRoute(location.pathname, location.search);
  // 多个信箱时默认聚合视图，单个信箱就直接用它；路由中的 mailboxId 优先。
  const [mailboxId, setMailboxId] = useState(
    initialRoute.mailboxId ?? (mailboxes.length > 1 ? "all" : mailboxes[0]?.id),
  );
  // 聚合视图下每封信可能来自不同信箱，操作要按邮件自身的信箱路由
  const [detailMailboxId, setDetailMailboxId] = useState<string | undefined>(undefined);
  const [folder, setFolder] = useState<MailFolder>(initialRoute.folder);
  const [category, setCategory] = useState<string>("");
  const [view, setView] = useState<MailView>(initialRoute.view);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [items, setItems] = useState<MessageSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [pageSize, setPageSize] = useState<MessagePageSize>(() => {
    try {
      const saved = Number(localStorage.getItem("mailedge-message-page-size-v1"));
      return MESSAGE_PAGE_SIZE_OPTIONS.includes(saved as MessagePageSize)
        ? (saved as MessagePageSize)
        : MESSAGE_PAGE_SIZE_OPTIONS[0];
    } catch {
      return MESSAGE_PAGE_SIZE_OPTIONS[0];
    }
  });
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [messageListStyle, setMessageListStyle] = useState<MessageListStyle>(() => {
    try {
      // 新版默认使用单行紧凑列表；旧版的舒适列表偏好不再阻塞本次布局升级，
      // 用户仍可通过页脚中间的样式按钮切回舒适列表。
      return localStorage.getItem("mailedge-message-list-style-v2") === "comfortable"
        ? "comfortable"
        : "compact";
    } catch {
      return "compact";
    }
  });
  const [stats, setStats] = useState<FolderStats[]>([]);
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // 浏览器标签实时提示未读数量，邮件已读/新信事件会通过 stats 刷新触发更新。
  useEffect(() => {
    const unread = stats.reduce((total, item) => total + item.unread, 0);
    document.title = unread > 0 ? `(${unread}) ${t("app.name")}` : t("app.name");
    return () => {
      document.title = t("app.name");
    };
  }, [stats, t]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // URL 是工作区视图的唯一持久来源：前进、后退和刷新都会恢复相同页面。
  useEffect(() => {
    setView(initialRoute.view);
    setFolder(initialRoute.folder);
    if (initialRoute.mailboxId) {
      setMailboxId(initialRoute.mailboxId);
    } else if (initialRoute.view === "mail") {
      setMailboxId(mailboxes.length > 1 ? "all" : mailboxes[0]?.id);
    }
  }, [initialRoute.folder, initialRoute.mailboxId, initialRoute.view, mailboxes]);

  useEffect(() => {
    if (view !== "mail") {
      setActiveId(null);
      setDetail(null);
    }
  }, [view]);

  // 设置页“添加到邮件”通过一次性的路由 state 把已归档附件交给写信框，
  // 消费后立即清掉 state，刷新页面不会重复打开或重复添加附件。
  useEffect(() => {
    const staged = (location.state as { composeStagedAttachment?: StagedAttachment } | null)
      ?.composeStagedAttachment;
    if (!staged) return;
    setComposeDraft({ stagedAttachment: staged });
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  // 竞态守卫：列表与详情的请求可能交错返回，用自增序号只接受最后一次的结果
  const listSeqRef = useRef(0);
  const detailSeqRef = useRef(0);
  // 每一页保存自己的时间游标。翻页只更新 React 状态并重新请求当前页，不刷新整页。
  const pageCursorsRef = useRef<Array<string | undefined>>([undefined]);
  const queryKeyRef = useRef("");

  const loadList = useCallback(
    async (before = pageCursorsRef.current[page]) => {
      const seq = ++listSeqRef.current;
      setListLoading(true);
      try {
        const result = await api.messages({
          mailboxId,
          folder,
          category: category || undefined,
          q: search || undefined,
          before,
          limit: pageSize,
        });
        if (seq !== listSeqRef.current) return; // 已有更新的请求，丢弃过期响应
        setItems(result.items);
        setCursor(result.nextCursor);
      } catch {
        // 列表加载失败静默：下一次轮询/事件会再试
      } finally {
        if (seq === listSeqRef.current) setListLoading(false);
      }
    },
    [mailboxId, folder, category, search, page, pageSize],
  );

  const loadStats = useCallback(async () => {
    try {
      const result = await api.stats(mailboxId);
      setStats(result.stats);
    } catch {
      // 未读数失败静默，不影响主流程
    }
  }, [mailboxId]);

  const loadFolders = useCallback(async () => {
    try {
      const result = await api.folders();
      setCustomFolders(result.folders);
    } catch {
      setCustomFolders([]);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const result = await api.contacts();
      setContacts(result.contacts);
    } catch {
      // 联系人不是收件箱的阻塞依赖；迁移尚未应用时仍可正常阅读邮件。
      setContacts([]);
    }
  }, []);

  const queryKey = `${mailboxId ?? ""}\u0000${folder}\u0000${category}\u0000${search}\u0000${pageSize}\u0000${listReloadKey}`;

  /**
   * 侧边栏是重复点击也应该生效的导航入口。路由相同（例如已经在 /inbox
   * 第 3 页时再次点击收件箱）不会触发 location 变化，因此这里显式清掉
   * 分页游标、详情和查询条件，并用 key 触发一次新的列表请求。
   */
  function resetListNavigation() {
    pageCursorsRef.current = [undefined];
    queryKeyRef.current = "";
    listSeqRef.current += 1;
    setCursor(null);
    setPage(0);
    setActiveId(null);
    setDetail(null);
    setDetailMailboxId(undefined);
    setCategory("");
    setSearch("");
    setListReloadKey((current) => current + 1);
  }

  // 列表刷新统一防抖：敲键盘/切文件夹时不立刻连发请求。
  // 查询条件或每页数量变化时回到第一页；翻页只请求当前页数据。
  useEffect(() => {
    if (view !== "mail") return;
    setActiveId(null);
    setDetail(null);
    const queryChanged = queryKeyRef.current !== queryKey;
    if (queryChanged) {
      queryKeyRef.current = queryKey;
      pageCursorsRef.current = [undefined];
      setCursor(null);
      setListLoading(true);
      if (page !== 0) {
        setPage(0);
        return;
      }
    }
    const timer = window.setTimeout(
      () => void loadList(pageCursorsRef.current[page]),
      queryChanged ? 300 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [loadList, page, queryKey, view]);

  function goToPreviousPage() {
    if (page === 0 || listLoading) return;
    setCursor(null);
    setListLoading(true);
    setPage((current) => Math.max(0, current - 1));
  }

  function goToNextPage() {
    if (!cursor || listLoading) return;
    pageCursorsRef.current[page + 1] = cursor;
    setCursor(null);
    setListLoading(true);
    setPage((current) => current + 1);
  }

  function changePageSize(next: MessagePageSize) {
    if (!MESSAGE_PAGE_SIZE_OPTIONS.includes(next)) return;
    try {
      localStorage.setItem("mailedge-message-page-size-v1", String(next));
    } catch {
      // 隐私模式下无法持久化时仍保留本次页面设置
    }
    pageCursorsRef.current = [undefined];
    setPage(0);
    setPageSize(next);
  }

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

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

  async function moveTo(id: string, target: MailFolder, ownerId = detailMailboxId ?? mailboxId) {
    try {
      await api.patchMessage(id, { folder: target }, ownerId);
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

  async function removeMessage(id: string, ownerId = detailMailboxId ?? mailboxId) {
    try {
      await api.deleteMessage(id, ownerId);
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

  async function toggleStar(message: Pick<MessageSummary, "id" | "isStarred" | "mailboxId">) {
    const next = !message.isStarred;
    try {
      await api.patchMessage(
        message.id,
        { isStarred: next },
        message.mailboxId ?? detailMailboxId ?? mailboxId,
      );
    } catch {
      setToast(t("toast.actionFailed"));
      return;
    }
    setDetail((current) => (current?.id === message.id ? { ...current, isStarred: next } : current));
    setItems((previous) =>
      previous.map((item) => (item.id === message.id ? { ...item, isStarred: next } : item)),
    );
  }

  async function markRead(message: Pick<MessageSummary, "id" | "mailboxId">, isRead: boolean) {
    try {
      await api.patchMessage(message.id, { isRead }, message.mailboxId ?? detailMailboxId ?? mailboxId);
    } catch {
      setToast(t("toast.actionFailed"));
      return;
    }
    setDetail((current) => (current?.id === message.id ? { ...current, isRead } : current));
    setItems((previous) => previous.map((item) => (item.id === message.id ? { ...item, isRead } : item)));
    void loadStats();
  }

  async function markAllRead() {
    try {
      await api.markAllRead(folder, mailboxId);
    } catch {
      setToast(t("toast.actionFailed"));
      return;
    }
    setItems((previous) => previous.map((item) => ({ ...item, isRead: true })));
    setDetail((current) => (current?.folder === folder ? { ...current, isRead: true } : current));
    void loadStats();
  }

  async function addContact(email: string, name: string) {
    try {
      const result = await api.createContact({ email, name });
      setContacts((current) =>
        current.some((contact) => contact.id === result.contact.id) ? current : [...current, result.contact],
      );
      setToast(t("detail.contactAdded"));
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("toast.actionFailed"));
      // 联系人可能已在另一标签页创建，重新拉取后保持详情按钮状态准确。
      void loadContacts();
    }
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
      aiReplyTarget: detailMailboxId ? { messageId: message.id, mailboxId: detailMailboxId } : undefined,
    });
  }

  function replyAllTo(message: MessageDetail) {
    const mailbox = mailboxes.find((item) => item.id === detailMailboxId);
    const from = mailbox?.address ?? message.to[0]?.email;
    const own = from?.trim().toLowerCase();
    const recipients = [message.from, ...message.to, ...message.cc]
      .map((address) => address.email.trim())
      .filter((email, index, addresses) => {
        const normalized = email.toLowerCase();
        return (
          normalized &&
          normalized !== own &&
          addresses.findIndex((item) => item.toLowerCase() === normalized) === index
        );
      });
    const [to, ...cc] = recipients;
    setComposeDraft({
      from,
      to: to ?? message.from.email,
      cc: cc.join(", "),
      subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`,
      text: `\n\n${t("reply.quote", { from: message.from.email })}${message.text ?? ""}`,
      aiReplyTarget: detailMailboxId ? { messageId: message.id, mailboxId: detailMailboxId } : undefined,
    });
  }

  function forwardMessage(message: MessageDetail) {
    const mailbox = mailboxes.find((item) => item.id === detailMailboxId);
    const from = mailbox?.address ?? message.to[0]?.email;
    const recipients = message.to.map((address) => address.email).join(", ");
    const forwarded = [
      "",
      "",
      "---------- Forwarded message ----------",
      `From: ${displayName(message.from)} <${message.from.email}>`,
      `Date: ${formatDateTime(message.receivedAt)}`,
      `Subject: ${message.subject}`,
      `To: ${recipients}`,
      "",
      message.text ?? "",
    ].join("\n");
    setComposeDraft({
      from,
      subject: message.subject.startsWith("Fwd:") ? message.subject : `Fwd: ${message.subject}`,
      text: forwarded,
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

  const mailDetailOpen = view === "mail" && Boolean(detail);
  const folderLabel = customFolders.find((item) => item.id === folder)?.name;
  const shellMode =
    view === "dashboard"
      ? " shell--dashboard"
      : view === "attachments"
        ? " shell--attachments"
        : view !== "mail"
          ? ""
          : mailDetailOpen
            ? " shell--detail"
            : " shell--list-only";

  return (
    <div className={`shell${shellMode}`}>
      <Sidebar
        user={user}
        mailboxes={mailboxes}
        activeMailboxId={mailboxId}
        activeFolder={folder}
        view={view}
        stats={stats}
        customFolders={customFolders}
        onSelectMailbox={(nextMailboxId) => {
          resetListNavigation();
          navigate(mailPath("mail", "inbox", nextMailboxId));
        }}
        onSelectFolder={(next) => {
          resetListNavigation();
          navigate(mailPath("mail", next, mailboxId));
        }}
        onCreateFolder={async (name) => {
          await api.createFolder({ name });
          await loadFolders();
        }}
        onSelectView={(nextView) => {
          resetListNavigation();
          navigate(mailPath(nextView, folder, mailboxId));
        }}
        onCompose={() => setComposeDraft({})}
        onSignOut={() => void signOut()}
        messageListStyle={messageListStyle}
        onToggleMessageListStyle={toggleMessageListStyle}
      />

      {view === "dashboard" ? (
        <Suspense
          fallback={
            <main className="dashboard-view">
              <div className="dashboard-page dashboard-page--loading">{t("list.loading")}</div>
            </main>
          }
        >
          <DashboardView />
        </Suspense>
      ) : view === "outbox" ? (
        <OutboxView />
      ) : view === "contacts" ? (
        <ContactsView onChanged={() => void loadContacts()} />
      ) : view === "attachments" ? (
        <SettingsToastProvider>
          <div className="home-attachment-view">
            <AttachmentPanel />
          </div>
        </SettingsToastProvider>
      ) : (
        <>
          <MessageList
            items={items}
            loading={listLoading}
            activeId={activeId}
            search={search}
            folder={folder}
            folderLabel={folderLabel}
            listStyle={messageListStyle}
            category={category}
            showCategories={folder === "inbox"}
            onSelectCategory={setCategory}
            onSearch={setSearch}
            onMarkAllRead={() => void markAllRead()}
            onMove={(message, target) => void moveTo(message.id, target, message.mailboxId ?? mailboxId)}
            onDelete={(message) => void removeMessage(message.id, message.mailboxId ?? mailboxId)}
            onMarkRead={(message, isRead) => void markRead(message, isRead)}
            onToggleStar={(message) => void toggleStar(message)}
            onSelect={(message) => void openMessage(message)}
            page={page}
            pageSize={pageSize}
            detailOpen={mailDetailOpen}
            hasPrevious={page > 0}
            hasMore={Boolean(cursor)}
            onPreviousPage={goToPreviousPage}
            onNextPage={goToNextPage}
            onPageSizeChange={changePageSize}
          />

          <MessageView
            message={detail}
            loading={detailLoading}
            mailboxId={detailMailboxId}
            aiEnabled={aiEnabled}
            customFolders={customFolders}
            onReply={replyTo}
            onInlineSent={(result) => {
              onSent(result);
              void loadList();
            }}
            onReplyAll={replyAllTo}
            onForward={forwardMessage}
            onMove={(id, target) => void moveTo(id, target)}
            onDelete={(id) => void removeMessage(id)}
            onMarkAllRead={() => void markAllRead()}
            onMarkRead={(message, isRead) => void markRead(message, isRead)}
            onToggleStar={(message) => void toggleStar(message)}
            onClose={() => {
              setActiveId(null);
              setDetail(null);
              setDetailMailboxId(undefined);
            }}
            contact={
              contacts.find((contact) => contact.email.toLowerCase() === detail?.from.email.toLowerCase()) ??
              null
            }
            onAddContact={(email, name) => void addContact(email, name)}
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
