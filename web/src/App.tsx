import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthPage from "./pages/AuthPage";
import MailPage from "./pages/MailPage";
import SettingsPage from "./pages/SettingsPage";
import { ApiError, api } from "./lib/api";
import type { Mailbox, User } from "./lib/api";

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

  if (state.phase === "loading") {
    return (
      <div className="empty">
        <Loader2 size={20} className="spin" />
        <p>MailEdge</p>
      </div>
    );
  }

  if (state.phase !== "ready") {
    return <AuthPage mode={state.phase === "setup" ? "setup" : "login"} onAuthenticated={load} />;
  }

  return (
    <SessionContext.Provider
      value={{ user: state.user, mailboxes: state.mailboxes, refresh: load, signOut }}
    >
      <Routes>
        <Route path="/" element={<MailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionContext.Provider>
  );
}
