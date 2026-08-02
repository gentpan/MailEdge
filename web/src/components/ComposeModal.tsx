import { Paperclip, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { markdownToEmailHtml } from "../../../src/shared/markdown";
import { useI18n } from "../i18n";
import type { Mailbox, ProviderView, SendResponse, StagedAttachment } from "../lib/api";
import { api } from "../lib/api";
import { formatSize, PROVIDER_LABELS } from "../lib/format";

export interface ComposeDraft {
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  stagedAttachment?: StagedAttachment;
}

// 模块级常量：避免每次渲染新建空数组导致 useMemo 依赖不稳定
const NO_DOMAINS: string[] = [];

/** 写信附件：选中即上传到暂存区，显示进度 */
interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  progress: number;
  token?: string;
  error?: string;
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
  smartThresholdMb = 2,
  onClose,
  onSent,
}: Props) {
  const { t } = useI18n();
  const [from, setFrom] = useState(draft?.from ?? mailboxes[0]?.address ?? "");
  const [to, setTo] = useState(draft?.to ?? "");
  const [cc, setCc] = useState(draft?.cc ?? "");
  const [bcc, setBcc] = useState("");
  const [showExtra, setShowExtra] = useState(Boolean(draft?.cc));
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [text, setText] = useState(draft?.text ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const stagedAttachment = draft?.stagedAttachment;
  const [attachments, setAttachments] = useState<AttachmentItem[]>(() =>
    stagedAttachment
      ? [
          {
            id: `staged-${stagedAttachment.token}`,
            name: stagedAttachment.filename,
            size: stagedAttachment.size,
            status: "done",
            progress: 100,
            token: stagedAttachment.token,
          },
        ]
      : [],
  );
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const thresholdBytes = smartThresholdMb * 1024 * 1024;
  const largeFiles = useMemo(
    () => attachments.filter((a) => a.size > thresholdBytes),
    [attachments, thresholdBytes],
  );
  const uploading = attachments.some((a) => a.status === "uploading");

  /** 选中文件即上传到暂存区，带进度 */
  function handleFiles(newFiles: FileList | null) {
    for (const file of Array.from(newFiles ?? [])) {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((prev) => [
        ...prev,
        { id, name: file.name, size: file.size, status: "uploading", progress: 0 },
      ]);
      api
        .uploadAttachment(file, (percent) => {
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, progress: percent } : a)));
        })
        .then((res) => {
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "done", token: res.token, progress: 100 } : a)),
          );
        })
        .catch((err) => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, status: "error", error: err instanceof Error ? err.message : "上传失败" }
                : a,
            ),
          );
        });
    }
  }

  /** 删除附件（同时清理暂存区） */
  function removeAttachment(id: string, token?: string) {
    if (token) void api.deleteAttachment(token).catch(() => undefined);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  /** 关闭写信框前，清理未发送的暂存附件 */
  function cleanupAndClose() {
    for (const a of attachments) if (a.token) void api.deleteAttachment(a.token).catch(() => undefined);
    onClose();
  }

  // 按所选渠道的「已验证域名」约束发件人：只有该域名的信箱才能选。
  // 渠道没配已验证域名（或用 Cloudflare/SMTP）时不限制。
  const effectiveProvider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.isDefault);
  const verifiedDomains = (effectiveProvider?.config?.verifiedDomains as string[] | undefined) ?? NO_DOMAINS;
  const allowedMailboxes = useMemo(
    () =>
      verifiedDomains.length
        ? mailboxes.filter((m) => verifiedDomains.includes(m.address.split("@")[1] ?? ""))
        : mailboxes,
    [mailboxes, verifiedDomains],
  );
  const senderLimited = verifiedDomains.length > 0 && allowedMailboxes.length < mailboxes.length;

  // 切换渠道后若当前发件人不再允许，回退到第一个可用地址
  useEffect(() => {
    if (allowedMailboxes.length && !allowedMailboxes.some((m) => m.address === from)) {
      setFrom(allowedMailboxes[0]!.address);
    }
  }, [allowedMailboxes, from]);

  async function submit() {
    if (uploading) {
      setError(t("compose.uploading"));
      return;
    }
    const uploaded = attachments.filter((a) => a.status === "done" && a.token);
    if (attachments.some((a) => a.status === "error")) {
      setError(t("compose.uploadError"));
      return;
    }
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
          // 交给服务端转换：Markdown 原文作为纯文本版本，转换结果作为 HTML 版本
          markdown: text,
          providerId: providerId || undefined,
        },
        uploaded.map((a) => ({ token: a.token as string, filename: a.name })),
      );
      onSent(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal__header">
          <h3>{t("compose.title")}</h3>
          <button
            className="btn btn--icon"
            type="button"
            onClick={cleanupAndClose}
            aria-label={t("compose.cancel")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal__body">
          {error && <div className="alert alert--error">{error}</div>}

          <div className="compose-row">
            <span className="compose-row__label">{t("compose.from")}</span>
            <select className="select" value={from} onChange={(event) => setFrom(event.target.value)}>
              {allowedMailboxes.map((mailbox) => (
                <option key={mailbox.id} value={mailbox.address}>
                  {mailbox.displayName ? `${mailbox.displayName} <${mailbox.address}>` : mailbox.address}
                </option>
              ))}
            </select>
          </div>

          {senderLimited && (
            <p className="text-xs text-tertiary" style={{ marginTop: "var(--space-1)" }}>
              {t("compose.senderLimited", { domains: verifiedDomains.join("、") })}
            </p>
          )}

          <div className="compose-row">
            <span className="compose-row__label">{t("compose.to")}</span>
            <input
              className="input"
              value={to}
              placeholder={t("compose.to.hint")}
              onChange={(event) => setTo(event.target.value)}
            />
            {!showExtra && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={() => setShowExtra(true)}>
                {t("compose.ccbcc")}
              </button>
            )}
          </div>

          {showExtra && (
            <>
              <div className="compose-row">
                <span className="compose-row__label">{t("compose.cc")}</span>
                <input className="input" value={cc} onChange={(event) => setCc(event.target.value)} />
              </div>
              <div className="compose-row">
                <span className="compose-row__label">{t("compose.bcc")}</span>
                <input className="input" value={bcc} onChange={(event) => setBcc(event.target.value)} />
              </div>
            </>
          )}

          <div className="compose-row">
            <span className="compose-row__label">{t("compose.subject")}</span>
            <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>

          {isAdmin && providers.length > 0 && (
            <div className="compose-row">
              <span className="compose-row__label">{t("compose.channel")}</span>
              <select
                className="select"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
              >
                <option value="">{t("compose.channel.default")}</option>
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

          <div className="compose-toolbar">
            <div className="tabs">
              <button
                type="button"
                className={`tab${mode === "edit" ? " tab--active" : ""}`}
                onClick={() => setMode("edit")}
              >
                {t("compose.tab.edit")}
              </button>
              <button
                type="button"
                className={`tab${mode === "preview" ? " tab--active" : ""}`}
                onClick={() => setMode("preview")}
              >
                {t("compose.tab.preview")}
              </button>
            </div>
            <span className="text-xs text-tertiary">{t("compose.md.hint")}</span>
          </div>

          {mode === "edit" ? (
            <textarea
              className="compose-body"
              value={text}
              placeholder={t("compose.body.placeholder")}
              onChange={(event) => setText(event.target.value)}
            />
          ) : (
            <div className="compose-preview">
              {text.trim() ? (
                // 预览用的正是发送时生成的那份 HTML，所见即所发。
                // markdownToEmailHtml 内部对输入做了转义，用户写的原始 HTML 不会被执行。
                // biome-ignore lint/security/noDangerouslySetInnerHtml: 内容由 markdownToEmailHtml 转义后生成
                <div dangerouslySetInnerHTML={{ __html: markdownToEmailHtml(text) }} />
              ) : (
                <p className="text-xs text-tertiary">{t("compose.preview.empty")}</p>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="file-list">
              {attachments.map((attachment) => (
                <div className="file-item" key={attachment.id}>
                  <Paperclip size={14} />
                  <span className="file-item__name">{attachment.name}</span>
                  <span className="text-tertiary">{formatSize(attachment.size)}</span>
                  {attachment.status === "uploading" && (
                    <div className="file-item__progress">
                      <div className="file-item__bar">
                        <div className="file-item__fill" style={{ width: `${attachment.progress}%` }} />
                      </div>
                      <span className="text-xs">{attachment.progress}%</span>
                    </div>
                  )}
                  {attachment.status === "done" && attachment.size > thresholdBytes && (
                    <span className="badge badge--primary">{t("compose.toLink")}</span>
                  )}
                  {attachment.status === "error" && (
                    <span className="text-xs text-tertiary">{attachment.error}</span>
                  )}
                  <button
                    className="btn btn--icon"
                    type="button"
                    aria-label={t("common.delete")}
                    onClick={() => removeAttachment(attachment.id, attachment.token)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {largeFiles.length > 0 && (
            <div className="alert alert--warning">
              {t("compose.largeHint", { n: largeFiles.length, mb: smartThresholdMb })}
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn" type="button" onClick={submit} disabled={busy || uploading || !from || !to}>
            <Send size={16} />
            {busy ? t("compose.send.busy") : t("compose.send")}
          </button>

          <label className="btn btn--secondary">
            <Paperclip size={16} />
            {t("compose.addAttachment")}
            <input
              type="file"
              multiple
              hidden
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>

          <div className="modal__footer-spacer" />
          <button className="btn btn--ghost" type="button" onClick={cleanupAndClose}>
            {t("compose.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
