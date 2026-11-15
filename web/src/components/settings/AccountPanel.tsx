import { client } from "@passwordless-id/webauthn";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../App";
import { useI18n } from "../../i18n";
import type { User } from "../../lib/api";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { KeyRound, ShieldCheck, Trash2 } from "../icons";
import FormRow from "./FormRow";
import ProfileEditor from "./ProfileEditor";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

interface Props {
  user: User;
}

export default function AccountPanel({ user }: Props) {
  const { t } = useI18n();
  // 独立版的账号就是邮件服务器上的邮箱：密码在服务器上改，角色只有一种；可以改发信昵称、头像，也能添加 Passkey
  const session = useSession();
  const standalone = session.edition === "standalone";
  const [passkeys, setPasskeys] = useState<
    Array<{ id: string; createdAt: string; lastUsedAt: string | null }>
  >([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const { showToast, dismissToast } = useSettingsToast();
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const loadPasskeys = useCallback(async () => {
    if (!standalone) return;
    try {
      setPasskeys((await api.passkeys()).passkeys);
    } catch {
      // 列表拿不到不影响添加
    }
  }, [standalone]);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  async function removePasskey(id: string) {
    dismissToast();
    try {
      await api.deletePasskey(id);
      showToast({ kind: "success", text: t("account.passkey.removed") });
      await loadPasskeys();
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : "error" });
    }
  }

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
      await loadPasskeys();
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

      {standalone ? (
        <>
          <FormRow label={t("account.profile")}>
            <ProfileEditor
              email={user.email}
              name={user.name}
              avatarUrl={user.avatarUrl ?? null}
              onSaveName={async (name) => {
                await api.updateProfile({ name });
                await session.refresh();
                showToast({ kind: "success", text: t("account.profile.saved") });
              }}
              onUploadAvatar={async (image) => {
                await api.uploadAvatar(image);
                await session.refresh();
              }}
              onDeleteAvatar={async () => {
                await api.deleteAvatar();
                await session.refresh();
              }}
              onError={(text) => showToast({ kind: "error", text })}
            />
          </FormRow>
          <FormRow label={t("account.password")}>
            <p className="text-sm">{t("account.password.standalone")}</p>
          </FormRow>
        </>
      ) : (
        <>
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
        </>
      )}

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
            <span>{t(standalone ? "account.passkey.standaloneNote" : "account.passkey.note")}</span>
          </div>
          {standalone && passkeys.length > 0 && (
            <ul className="account-passkey-list" aria-label={t("account.passkey.list")}>
              {passkeys.map((item) => (
                <li key={item.id}>
                  <KeyRound size={14} aria-hidden="true" />
                  <span>{t("account.passkey.item", { created: formatDateTime(item.createdAt) })}</span>
                  <span className="account-passkey-list__meta">
                    {item.lastUsedAt
                      ? t("account.passkey.lastUsed", { time: formatDateTime(item.lastUsedAt) })
                      : t("account.passkey.neverUsed")}
                  </span>
                  <button
                    type="button"
                    className="btn btn--icon"
                    title={t("account.passkey.remove")}
                    aria-label={t("account.passkey.remove")}
                    onClick={() => void removePasskey(item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </SettingsPanel>
  );
}
