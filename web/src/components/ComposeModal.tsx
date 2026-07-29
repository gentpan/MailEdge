import { useMemo, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { api } from "../lib/api";
import type { Mailbox, ProviderView, SendResponse } from "../lib/api";
import { PROVIDER_LABELS, formatSize } from "../lib/format";

export interface ComposeDraft {
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
}

interface Props {
  mailboxes: Mailbox[];
  providers: ProviderView[];
  isAdmin: boolean;
  draft?: ComposeDraft;
  smartThresholdMb?: number;
  onClose: () => void;
  onSent: (result: SendResponse) => void;
}

export default function ComposeModal({
  mailboxes,
  providers,
  isAdmin,
  draft,
  smartThresholdMb = 3,
  onClose,
  onSent,
}: Props) {
  const [from, setFrom] = useState(mailboxes[0]?.address ?? "");
  const [to, setTo] = useState(draft?.to ?? "");
  const [cc, setCc] = useState(draft?.cc ?? "");
  const [bcc, setBcc] = useState("");
  const [showExtra, setShowExtra] = useState(Boolean(draft?.cc));
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [text, setText] = useState(draft?.text ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const thresholdBytes = smartThresholdMb * 1024 * 1024;
  const largeFiles = useMemo(() => files.filter((file) => file.size > thresholdBytes), [files, thresholdBytes]);

  async function submit() {
    setBusy(true);
    setError(null);

    try {
      const result = await api.send(
        {
          from,
          to,
          cc: cc ? cc.split(/[,;]/) : undefined,
          bcc: bcc ? bcc.split(/[,;]/) : undefined,
          subject,
          text,
          html: textToHtml(text),
          providerId: providerId || undefined,
        },
        files,
      );
      onSent(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal__header">
          <h3>写信</h3>
          <button className="btn btn--icon" type="button" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="modal__body">
          {error && <div className="alert alert--error">{error}</div>}

          <div className="compose-row">
            <span className="compose-row__label">发件人</span>
            <select className="select" value={from} onChange={(event) => setFrom(event.target.value)}>
              {mailboxes.map((mailbox) => (
                <option key={mailbox.id} value={mailbox.address}>
                  {mailbox.displayName ? `${mailbox.displayName} <${mailbox.address}>` : mailbox.address}
                </option>
              ))}
            </select>
          </div>

          <div className="compose-row">
            <span className="compose-row__label">收件人</span>
            <input
              className="input"
              value={to}
              placeholder="多个地址用逗号分隔"
              onChange={(event) => setTo(event.target.value)}
            />
            {!showExtra && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setShowExtra(true)}>
                抄送/密送
              </button>
            )}
          </div>

          {showExtra && (
            <>
              <div className="compose-row">
                <span className="compose-row__label">抄送</span>
                <input className="input" value={cc} onChange={(event) => setCc(event.target.value)} />
              </div>
              <div className="compose-row">
                <span className="compose-row__label">密送</span>
                <input className="input" value={bcc} onChange={(event) => setBcc(event.target.value)} />
              </div>
            </>
          )}

          <div className="compose-row">
            <span className="compose-row__label">主题</span>
            <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>

          {isAdmin && providers.length > 0 && (
            <div className="compose-row">
              <span className="compose-row__label">发信渠道</span>
              <select
                className="select"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
              >
                <option value="">默认渠道</option>
                {providers
                  .filter((provider) => provider.isEnabled !== false)
                  .map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}（{PROVIDER_LABELS[provider.type] ?? provider.type}）
                    </option>
                  ))}
              </select>
            </div>
          )}

          <textarea
            className="compose-body"
            value={text}
            placeholder="写点什么…"
            onChange={(event) => setText(event.target.value)}
          />

          {files.length > 0 && (
            <div className="file-list">
              {files.map((file, index) => (
                <div className="file-item" key={`${file.name}-${index}`}>
                  <Paperclip size={14} />
                  <span className="file-item__name">{file.name}</span>
                  <span className="text-tertiary">{formatSize(file.size)}</span>
                  {file.size > thresholdBytes && <span className="badge badge--primary">转下载链接</span>}
                  <button
                    className="btn btn--icon"
                    type="button"
                    aria-label="移除附件"
                    onClick={() => setFiles(files.filter((_, position) => position !== index))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {largeFiles.length > 0 && (
            <div className="alert alert--warning">
              有 {largeFiles.length} 个附件超过 {smartThresholdMb} MB，将自动上传到 R2 并在正文中插入下载链接。
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn" type="button" onClick={submit} disabled={busy || !from || !to}>
            <Send size={16} />
            {busy ? "发送中…" : "发送"}
          </button>

          <label className="btn btn--secondary">
            <Paperclip size={16} />
            添加附件
            <input
              type="file"
              multiple
              hidden
              onChange={(event) => {
                setFiles([...files, ...Array.from(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </label>

          <div className="modal__footer-spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#111827;">${escaped}</div>`;
}
