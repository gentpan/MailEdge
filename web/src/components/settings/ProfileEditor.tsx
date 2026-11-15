import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { prepareAvatar } from "../../lib/avatarImage";
import Spinner from "../Spinner";
import UserAvatar from "../UserAvatar";

interface Props {
  email: string;
  name: string | null;
  avatarUrl: string | null;
  onSaveName: (name: string | null) => Promise<void>;
  onUploadAvatar: (image: Blob) => Promise<void>;
  onDeleteAvatar: () => Promise<void>;
  onError: (message: string) => void;
}

/** 资料编辑：头像（上传前裁成 256px）和发信昵称。账户页和用户管理里的「编辑资料」共用。 */
export default function ProfileEditor({
  email,
  name,
  avatarUrl,
  onSaveName,
  onUploadAvatar,
  onDeleteAvatar,
  onError,
}: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(name ?? ""), [name]);

  const trimmed = draft.trim();
  const dirty = trimmed !== (name ?? "");

  async function saveName() {
    setSavingName(true);
    try {
      await onSaveName(trimmed || null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setSavingName(false);
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setAvatarBusy(true);
    try {
      await onUploadAvatar(await prepareAvatar(file));
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      await onDeleteAvatar();
    } catch (error) {
      onError(error instanceof Error ? error.message : "error");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="profile-editor">
      <div className="profile-editor__avatar">
        <UserAvatar
          label={name || email}
          avatarUrl={avatarUrl}
          className="profile-editor__avatar-img"
          size={64}
        />
        <div className="profile-editor__avatar-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            hidden
            onChange={(event) => void pickFile(event.target.files?.[0])}
          />
          <button
            type="button"
            className={`btn btn--secondary${avatarBusy ? " btn--loading" : ""}`}
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            aria-busy={avatarBusy}
          >
            <span className="btn__label">
              {avatarUrl ? t("profile.avatar.change") : t("profile.avatar.upload")}
            </span>
            {avatarBusy && <Spinner />}
          </button>
          {avatarUrl && (
            <button
              type="button"
              className="link-button"
              onClick={() => void removeAvatar()}
              disabled={avatarBusy}
            >
              {t("profile.avatar.remove")}
            </button>
          )}
          <span className="profile-editor__hint">{t("profile.avatar.hint")}</span>
        </div>
      </div>

      <form
        className="profile-editor__name"
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) void saveName();
        }}
      >
        <label className="field__label" htmlFor={`profile-name-${email}`}>
          {t("profile.name")}
        </label>
        <div className="profile-editor__name-row">
          <input
            id={`profile-name-${email}`}
            className="input"
            maxLength={64}
            placeholder={t("profile.name.placeholder")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            className={`btn${savingName ? " btn--loading" : ""}`}
            disabled={!dirty || savingName}
            aria-busy={savingName}
          >
            <span className="btn__label">{t("common.save")}</span>
            {savingName && <Spinner />}
          </button>
        </div>
        <span className="profile-editor__hint">
          {t("profile.name.hint", { example: `${trimmed || t("profile.name.sample")} <${email}>` })}
        </span>
      </form>
    </div>
  );
}
