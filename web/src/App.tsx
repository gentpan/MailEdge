import { Loader2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import Logo from "./components/Logo";
import type { Mailbox, User } from "./lib/api";
import { ApiError, api } from "./lib/api";
import AuthPage from "./pages/AuthPage";
import LicensePage from "./pages/LicensePage";
import MailPage from "./pages/MailPage";
import SettingsPage from "./pages/SettingsPage";

interface SessionValue {
  user: User;
  mailboxes: Mailbox[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession 必须在已登录的界面内使用");
  return value;
}

type State =
  | { phase: "loading" }
  | { phase: "setup" }
  | { phase: "anonymous" }
  | { phase: "ready"; user: User; mailboxes: Mailbox[] };

export default function App() {
  const location = useLocation();
  const [state, setState] = useState<State>({ phase: "loading" });

  const load = useCallback(async () => {
    try {
      const { user, mailboxes } = await api.me();
      setState({ phase: "ready", user, mailboxes });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const { needsSetup } = await api.needsSetup();
        setState({ phase: needsSetup ? "setup" : "anonymous" });
        return;
      }
      setState({ phase: "anonymous" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setState({ phase: "anonymous" });
  }, []);

  // 许可证和第三方来源页不需要登录，便于用户在登录前核对授权信息。
  if (location.pathname === "/license") return <LicensePage />;

  if (state.phase === "loading") {
    return (
      <div className="empty">
        <Loader2 size={20} className="spin" />
        <p>
          <Logo size={18} />
          MailEdge
        </p>
      </div>
    );
  }

  if (state.phase !== "ready") {
    return <AuthPage mode={state.phase === "setup" ? "setup" : "login"} onAuthenticated={load} />;
  }

  return (
    <SessionContext.Provider value={{ user: state.user, mailboxes: state.mailboxes, refresh: load, signOut }}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<MailPage />} />
        <Route path="/inbox" element={<MailPage />} />
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
