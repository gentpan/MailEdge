import { Loader2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import Logo from "./components/Logo";
import type { Mailbox, User } from "./lib/api";
import { ApiError, api } from "./lib/api";
import { brandName } from "./lib/brand";
import AuthPage from "./pages/AuthPage";
import LicensePage from "./pages/LicensePage";
import MailPage from "./pages/MailPage";
import SettingsPage from "./pages/SettingsPage";

interface SessionValue {
  user: User;
  mailboxes: Mailbox[];
  /** 能当发件人的地址（独立版的别名，含登录邮箱）；Worker 版是空数组，按信箱地址发信 */
  senderAddresses: string[];
  /** 后端是哪一版：worker（Cloudflare）/ standalone（独立版 V2，自托管 IMAP/SMTP） */
  edition: "worker" | "standalone";
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession 必须在已登录的界面内使用");
  return value;
}

type Edition = "worker" | "standalone";

type State =
  | { phase: "loading" }
  | { phase: "setup" }
  | { phase: "anonymous"; edition: Edition; captcha: boolean }
  | {
      phase: "ready";
      user: User;
      mailboxes: Mailbox[];
      senderAddresses: string[];
      edition: "worker" | "standalone";
    };

export default function App() {
  const location = useLocation();
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const { user, mailboxes, senderAddresses, edition } = await api.me();
      setState({
        phase: "ready",
        user,
        mailboxes,
        senderAddresses: senderAddresses ?? [],
        edition: edition === "standalone" ? "standalone" : "worker",
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // 登录前就要知道是不是独立版：独立版没有通行密钥和找回密码
        const { needsSetup, edition, captcha } = await api.needsSetup();
        setState(
          needsSetup
            ? { phase: "setup" }
            : {
                phase: "anonymous",
                edition: edition === "standalone" ? "standalone" : "worker",
                captcha: captcha === true,
              },
        );
        return;
      }
      setState({ phase: "anonymous", edition: "worker", captcha: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    // 重新问一遍服务端：回到登录页时要知道是哪一版、要不要人机验证
    await load();
  }, [load]);

  // 许可证和第三方来源页不需要登录，便于用户在登录前核对授权信息。
  if (location.pathname === "/license") return <LicensePage />;

  if (state.phase === "loading") {
    return (
      <div className="empty">
        <Loader2 size={20} className="spin" />
        <p>
          <Logo size={18} />
          {brandName()}
        </p>
      </div>
    );
  }

  if (state.phase !== "ready") {
    return (
      <AuthPage
        mode={state.phase === "setup" ? "setup" : "login"}
        edition={state.phase === "anonymous" ? state.edition : "worker"}
        captcha={state.phase === "anonymous" && state.captcha}
        onAuthenticated={load}
      />
    );
  }

  return (
    <SessionContext.Provider
      value={{
        user: state.user,
        mailboxes: state.mailboxes,
        senderAddresses: state.senderAddresses,
        edition: state.edition,
        refresh: load,
        signOut,
      }}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<MailPage />} />
        <Route path="/inbox" element={<MailPage />} />
        {/* v0.2.3 及更早版本公开过该路径；由 MailPage 保留查询参数并规范到 /inbox。 */}
        <Route path="/catchall" element={<MailPage />} />
        <Route path="/sent" element={<MailPage />} />
        <Route path="/archive" element={<MailPage />} />
        <Route path="/spam" element={<MailPage />} />
        <Route path="/trash" element={<MailPage />} />
        <Route path="/folder/:folderId" element={<MailPage />} />
        <Route path="/outbox" element={<MailPage />} />
        <Route path="/shares" element={<Navigate to="/attachments" replace />} />
        <Route path="/attachments" element={<MailPage />} />
        <Route path="/contacts" element={<MailPage />} />
        <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
        <Route path="/settings/:category" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}
