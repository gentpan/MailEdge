import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SettingsToastKind = "success" | "error" | "warning" | "info";

export interface SettingsToastMessage {
  kind: SettingsToastKind;
  text: string;
}

interface SettingsToastContextValue {
  showToast: (message: SettingsToastMessage) => void;
  dismissToast: () => void;
}

const SettingsToastContext = createContext<SettingsToastContextValue | null>(null);

export function useSettingsToast(): SettingsToastContextValue {
  const value = useContext(SettingsToastContext);
  if (!value) throw new Error("useSettingsToast 必须在 SettingsToastProvider 内使用");
  return value;
}

interface Props {
  children: ReactNode;
}

export default function SettingsToastProvider({ children }: Props) {
  const [toast, setToast] = useState<SettingsToastMessage | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((message: SettingsToastMessage) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timeout = toast.kind === "error" ? 6000 : 4000;
    const timer = window.setTimeout(dismissToast, timeout);
    return () => window.clearTimeout(timer);
  }, [dismissToast, toast]);

  return (
    <SettingsToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toast && <SettingsToast message={toast} onDismiss={dismissToast} />}
    </SettingsToastContext.Provider>
  );
}

function SettingsToast({ message, onDismiss }: { message: SettingsToastMessage; onDismiss: () => void }) {
  const Icon =
    message.kind === "success"
      ? CheckCircle2
      : message.kind === "error"
        ? CircleAlert
        : message.kind === "warning"
          ? TriangleAlert
          : Info;

  return (
    <div className="settings-toast-viewport">
      <div
        className={`settings-toast settings-toast--${message.kind}`}
        role={message.kind === "error" ? "alert" : "status"}
        aria-live={message.kind === "error" ? "assertive" : "polite"}
      >
        <Icon className="settings-toast__icon" size={18} aria-hidden="true" />
        <span className="settings-toast__content">{message.text}</span>
        <button className="settings-toast__close" type="button" onClick={onDismiss} aria-label="关闭通知">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
