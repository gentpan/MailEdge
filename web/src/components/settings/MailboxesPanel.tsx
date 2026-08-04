import { Check, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { Mailbox } from "../../lib/api";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import FormRow from "./FormRow";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

interface Props {
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function MailboxesPanel({ mailboxes, onChanged }: Props) {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isCatchAll, setIsCatchAll] = useState(false);
  const { showToast, dismissToast } = useSettingsToast();
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function add() {
    setBusy(true);
    dismissToast();
    try {
      await api.createMailbox({ address, displayName: displayName || undefined, isCatchAll });
      setAddress("");
      setDisplayName("");
      setIsCatchAll(false);
      onChanged();
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveDisplayName(id: string) {
    setBusy(true);
    dismissToast();
    try {
      await api.updateMailbox(id, { displayName: editingName.trim() || null });
      setEditingId(null);
      onChanged();
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPanel title={t("mb.title")} description={t("mb.desc")}>
      <div className="list-block">
        {mailboxes.map((mailbox) => (
          <div className="list-block__row" key={mailbox.id}>
            <div className="list-block__main">
              {editingId === mailbox.id ? (
                <div className="mailbox-name-editor">
                  <input
                    className="input"
                    value={editingName}
                    maxLength={40}
                    placeholder={t("mb.displayName.placeholder")}
                    aria-label={t("mb.displayName")}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveDisplayName(mailbox.id);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    className="btn btn--icon"
                    type="button"
                    title={t("common.save")}
                    aria-label={t("common.save")}
                    disabled={busy}
                    onClick={() => void saveDisplayName(mailbox.id)}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    className="btn btn--icon"
                    type="button"
                    title={t("common.cancel")}
                    aria-label={t("common.cancel")}
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="list-block__title" title={mailbox.address}>
                    {mailbox.displayName || mailbox.address}
                  </span>
                  <span className="list-block__sub">
                    {mailbox.displayName
                      ? mailbox.address
                      : `${t("mb.createdAt")} ${formatDateTime(mailbox.createdAt)}`}
                  </span>
                </>
              )}
            </div>
            {mailbox.isCatchAll && <span className="badge">{t("mb.catchAll")}</span>}
            {editingId !== mailbox.id && (
              <button
                className="btn btn--icon"
                type="button"
                aria-label={`${t("common.edit")} ${mailbox.address}`}
                title={t("mb.displayName.edit")}
                onClick={() => {
                  setEditingId(mailbox.id);
                  setEditingName(mailbox.displayName ?? "");
                }}
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              className="btn btn--icon"
              type="button"
              aria-label={`${t("common.delete")} ${mailbox.address}`}
              onClick={async () => {
                await api.deleteMailbox(mailbox.id);
                onChanged();
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!mailboxes.length && <div className="list-block__empty">{t("mb.empty")}</div>}
      </div>

      <FormRow label={t("mb.displayName")} hint={t("mb.displayName.hint")}>
        <input
          className="input"
          value={displayName}
          maxLength={40}
          placeholder={t("mb.displayName.placeholder")}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </FormRow>

      <FormRow label={t("mb.add")}>
        <input
          className="input"
          value={address}
          placeholder="you@yourdomain.com"
          onChange={(event) => setAddress(event.target.value)}
        />
      </FormRow>

      <FormRow label={t("mb.catchAll.field")} hint={t("mb.catchAll.hint")}>
        <label className="switch">
          <input
            type="checkbox"
            checked={isCatchAll}
            onChange={(event) => setIsCatchAll(event.target.checked)}
          />
          {t("mb.catchAll.label")}
        </label>
      </FormRow>

      <div className="form-actions">
        <button
          className="btn"
          type="button"
          onClick={() => void add()}
          disabled={busy || !address.includes("@")}
        >
          {busy ? t("common.saving") : t("mb.addBtn")}
        </button>
      </div>
    </SettingsPanel>
  );
}
