import { client } from "@passwordless-id/webauthn";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { User } from "../../lib/api";
import { api } from "../../lib/api";
import FormRow from "./FormRow";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

interface Props {
  user: User;
}

export default function AccountPanel({ user }: Props) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { showToast, dismissToast } = useSettingsToast();
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  async function update() {
    setBusy(true);
    dismissToast();
    try {
      await api.changePassword({ currentPassword, newPassword });
      showToast({ kind: "success", text: t("account.newPassword.hint") });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function addPasskey() {
    setPasskeyBusy(true);
    dismissToast();
    try {
      if (!client.isAvailable()) throw new Error(t("account.passkey.unavailable"));
      const options = await api.passkeyRegisterOptions();
      const registration = await client.register({
        challenge: options.challenge,
        domain: options.domain,
        user: options.user,
        userVerification: "required",
        discoverable: "required",
      });
      await api.passkeyRegisterVerify({ challenge: options.challenge, registration });
      showToast({ kind: "success", text: t("account.passkey.success") });
    } catch (error) {
      showToast({
        kind: "error",
        text: error instanceof Error ? error.message : t("account.passkey.failed"),
      });
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <SettingsPanel title={t("account.title")} description={t("account.desc")}>
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

      <section className="account-passkey-card" aria-labelledby="account-passkey-title">
        <div className="account-passkey-card__icon" aria-hidden="true">
          <KeyRound size={22} />
        </div>
        <div className="account-passkey-card__body">
          <div className="account-passkey-card__header">
            <div>
              <h2 id="account-passkey-title">{t("account.passkey.title")}</h2>
              <p>{t("account.passkey.hint")}</p>
            </div>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => void addPasskey()}
              disabled={passkeyBusy}
            >
              <KeyRound size={16} />
              {passkeyBusy ? t("account.passkey.busy") : t("account.passkey.add")}
            </button>
          </div>
          <div className="account-passkey-card__note">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>{t("account.passkey.note")}</span>
          </div>
        </div>
      </section>
    </SettingsPanel>
  );
}
