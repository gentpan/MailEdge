import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Mailbox } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useI18n } from "../../i18n";
import FormRow from "./FormRow";

interface Props {
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function MailboxesPanel({ mailboxes, onChanged }: Props) {
  const { t } = useI18n();
  const [address, setAddress] = useState("");
  const [isCatchAll, setIsCatchAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.createMailbox({ address, isCatchAll });
      setAddress("");
      setIsCatchAll(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">{t("mb.title")}</h1>
        <p className="panel-head__desc">{t("mb.desc")}</p>
      </header>

      <div className="list-block">
        {mailboxes.map((mailbox) => (
          <div className="list-block__row" key={mailbox.id}>
            <div className="list-block__main">
              <span className="list-block__title">{mailbox.address}</span>
              <span className="list-block__sub">
                {t("mb.createdAt")} {formatDateTime(mailbox.createdAt)}
              </span>
            </div>
            {mailbox.isCatchAll && <span className="badge">{t("mb.catchAll")}</span>}
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

      {error && <div className="alert alert--error">{error}</div>}

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
    </div>
  );
}
