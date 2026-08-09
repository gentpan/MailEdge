import { AlertTriangle, Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

type PendingAction =
  | { kind: "catchAll"; mailbox: Mailbox; next: boolean; replacement: Mailbox | null }
  | { kind: "delete"; mailbox: Mailbox };

export default function MailboxesPanel({ mailboxes, onChanged }: Props) {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isCatchAll, setIsCatchAll] = useState(false);
  const { showToast, dismissToast } = useSettingsToast();
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const inputDomain = address.trim().toLowerCase().split("@")[1] ?? "";
  const catchAllConflict = useMemo(
    () =>
      isCatchAll && inputDomain
        ? (mailboxes.find((mailbox) => mailbox.domain === inputDomain && mailbox.isCatchAll) ?? null)
        : null,
    [inputDomain, isCatchAll, mailboxes],
  );

  useEffect(() => {
    if (!pendingAction) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setPendingAction(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, pendingAction]);

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

  async function confirmPendingAction() {
    if (!pendingAction || busy) return;
    setBusy(true);
    dismissToast();
    try {
      if (pendingAction.kind === "delete") {
        await api.deleteMailbox(pendingAction.mailbox.id, {
          confirmCatchAll: pendingAction.mailbox.isCatchAll,
        });
        showToast({ kind: "success", text: t("mb.delete.success") });
      } else {
        await api.updateMailbox(pendingAction.mailbox.id, { isCatchAll: pendingAction.next });
        showToast({
          kind: "success",
          text: pendingAction.next ? t("mb.catchAll.enabled") : t("mb.catchAll.disabled"),
        });
      }
      setPendingAction(null);
      onChanged();
    } catch (caught) {
      showToast({ kind: "error", text: caught instanceof Error ? caught.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  function pendingTitle(): string {
    if (!pendingAction) return "";
    if (pendingAction.kind === "delete") {
      return pendingAction.mailbox.isCatchAll ? t("mb.delete.catchAll.title") : t("mb.delete.title");
    }
    if (!pendingAction.next) return t("mb.catchAll.disable.title");
    return pendingAction.replacement ? t("mb.catchAll.replace.title") : t("mb.catchAll.enable.title");
  }

  function pendingMessage(): string {
    if (!pendingAction) return "";
    if (pendingAction.kind === "delete") {
      return pendingAction.mailbox.isCatchAll
        ? t("mb.delete.catchAll.desc", {
            address: pendingAction.mailbox.address,
            domain: pendingAction.mailbox.domain,
          })
        : t("mb.delete.desc", { address: pendingAction.mailbox.address });
    }
    if (!pendingAction.next) {
      return t("mb.catchAll.disable.desc", { domain: pendingAction.mailbox.domain });
    }
    return pendingAction.replacement
      ? t("mb.catchAll.replace.desc", {
          domain: pendingAction.mailbox.domain,
          current: pendingAction.replacement.address,
          next: pendingAction.mailbox.address,
        })
      : t("mb.catchAll.enable.desc", {
          domain: pendingAction.mailbox.domain,
          address: pendingAction.mailbox.address,
        });
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
            <label className="switch mailbox-catchall-switch">
              <input
                type="checkbox"
                checked={mailbox.isCatchAll}
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.checked;
                  const replacement = next
                    ? (mailboxes.find(
                        (item) => item.id !== mailbox.id && item.domain === mailbox.domain && item.isCatchAll,
                      ) ?? null)
                    : null;
                  setPendingAction({ kind: "catchAll", mailbox, next, replacement });
                }}
              />
              <span>{t("mb.catchAll")}</span>
            </label>
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
              disabled={busy}
              onClick={() => setPendingAction({ kind: "delete", mailbox })}
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

      {catchAllConflict && (
        <div className="mailbox-inline-warning" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {t("mb.catchAll.conflict", {
              domain: catchAllConflict.domain,
              address: catchAllConflict.address,
            })}
          </span>
        </div>
      )}

      <div className="form-actions">
        <button
          className="btn"
          type="button"
          onClick={() => void add()}
          disabled={busy || !address.includes("@") || Boolean(catchAllConflict)}
        >
          {busy ? t("common.saving") : t("mb.addBtn")}
        </button>
      </div>

      {pendingAction && (
        <div className="modal-backdrop mailbox-confirm-backdrop" role="presentation">
          <div
            className="modal mailbox-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mailbox-confirm-title"
            aria-describedby="mailbox-confirm-message"
          >
            <div className="modal__header mailbox-confirm-modal__header">
              <div className="mailbox-confirm-modal__title">
                <span className="mailbox-confirm-modal__icon" aria-hidden="true">
                  <AlertTriangle size={20} />
                </span>
                <div>
                  <h2 id="mailbox-confirm-title">{pendingTitle()}</h2>
                  <p>{pendingAction.mailbox.address}</p>
                </div>
              </div>
              <button
                className="btn btn--icon"
                type="button"
                aria-label={t("common.cancel")}
                disabled={busy}
                onClick={() => setPendingAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal__body mailbox-confirm-modal__body">
              <p id="mailbox-confirm-message">{pendingMessage()}</p>
              {(pendingAction.kind === "delete" || !pendingAction.next) && (
                <div className="mailbox-confirm-modal__warning">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{t("mb.catchAll.routingWarning")}</span>
                </div>
              )}
            </div>
            <div className="modal__footer mailbox-confirm-modal__footer">
              <div className="modal__footer-spacer" />
              <button
                className="btn btn--secondary"
                type="button"
                disabled={busy}
                onClick={() => setPendingAction(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                className={`btn ${pendingAction.kind === "delete" ? "btn--danger" : ""}`}
                type="button"
                disabled={busy}
                onClick={() => void confirmPendingAction()}
              >
                {busy
                  ? t("common.saving")
                  : pendingAction.kind === "delete"
                    ? t("common.delete")
                    : t("mb.catchAll.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
