import { useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Mailbox } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import FormRow from "./FormRow";

interface Props {
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function MailboxesPanel({ mailboxes, onChanged }: Props) {
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
      setError(caught instanceof Error ? caught.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">收件地址</h1>
        <p className="panel-head__desc">
          收件依赖 Cloudflare Email Routing。这里添加的地址，需要在面板的
          Compute → Email Service → Email Routing 中把投递目标设为本 Worker。
        </p>
      </header>

      <div className="list-block">
        {mailboxes.map((mailbox) => (
          <div className="list-block__row" key={mailbox.id}>
            <div className="list-block__main">
              <span className="list-block__title">{mailbox.address}</span>
              <span className="list-block__sub">创建于 {formatDateTime(mailbox.createdAt)}</span>
            </div>
            {mailbox.isCatchAll && <span className="badge">兜底信箱</span>}
            <button
              className="btn btn--icon"
              type="button"
              aria-label={`删除 ${mailbox.address}`}
              onClick={async () => {
                await api.deleteMailbox(mailbox.id);
                onChanged();
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!mailboxes.length && <div className="list-block__empty">还没有收件地址</div>}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <FormRow label="添加地址">
        <input
          className="input"
          value={address}
          placeholder="you@yourdomain.com"
          onChange={(event) => setAddress(event.target.value)}
        />
      </FormRow>

      <FormRow label="兜底信箱" hint="接收该域名下所有未匹配的地址">
        <label className="switch">
          <input
            type="checkbox"
            checked={isCatchAll}
            onChange={(event) => setIsCatchAll(event.target.checked)}
          />
          设为 catch-all
        </label>
      </FormRow>

      <div className="form-actions">
        <button
          className="btn"
          type="button"
          onClick={() => void add()}
          disabled={busy || !address.includes("@")}
        >
          {busy ? "处理中…" : "添加"}
        </button>
      </div>
    </div>
  );
}
