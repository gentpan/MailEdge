import { useState } from "react";
import { useI18n } from "../../i18n";
import type { User } from "../../lib/api";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import FormRow from "./FormRow";

interface Props {
  user: User;
}

export default function AccountPanel({ user }: Props) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function update() {
    setBusy(true);
    setMessage(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setMessage({ kind: "success", text: t("account.newPassword.hint") });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">{t("account.title")}</h1>
        <p className="panel-head__desc">{t("account.desc")}</p>
      </header>

      <FormRow label={t("account.email")}>
        <p className="text-sm">{user.email}</p>
      </FormRow>

      <FormRow label={t("account.name")}>
        <p className="text-sm">{user.name || t("account.name.empty")}</p>
      </FormRow>

      <FormRow label={t("account.role")}>
        <span className="badge">
          {user.role === "admin" ? t("account.role.admin") : t("account.role.user")}
        </span>
      </FormRow>

      <FormRow label={t("account.createdAt")}>
        <p className="text-sm text-secondary">{formatDateTime(user.createdAt)}</p>
      </FormRow>

      {message && <div className={`alert alert--${message.kind}`}>{message.text}</div>}

      <FormRow label={t("account.currentPassword")}>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormRow>

      <FormRow label={t("account.newPassword")} hint={t("account.newPassword.hint")}>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </FormRow>

      <div className="form-actions">
        <button
          className="btn"
          type="button"
          onClick={() => void update()}
          disabled={busy || !currentPassword || newPassword.length < 8}
        >
          {busy ? t("common.saving") : t("account.updatePassword")}
        </button>
      </div>
    </div>
  );
}
