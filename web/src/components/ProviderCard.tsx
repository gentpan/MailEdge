import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Send, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { Mailbox, ProviderView } from "../lib/api";
import type { MailProviderType } from "../../../src/mail/types";
import { PROVIDER_LABELS, formatDateTime } from "../lib/format";

const DESCRIPTIONS: Record<MailProviderType, string> = {
  cloudflare: "Workers 原生绑定，无需额外 HTTP 请求。单封上限 5 MiB、最多 32 个附件；发往任意外部邮箱需要 Workers Paid。",
  resend: "成熟的第三方发信服务，需要在 Resend 后台完成域名验证。",
  sendflare: "使用 API Token 认证，可选 HMAC 签名。",
};

interface Props {
  type: MailProviderType;
  provider?: ProviderView;
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function ProviderCard({ type, provider, mailboxes, onChanged }: Props) {
  const [open, setOpen] = useState(!provider);
  const [name, setName] = useState(provider?.name ?? PROVIDER_LABELS[type] ?? type);
  const [apiKey, setApiKey] = useState((provider?.config.apiKey as string) ?? "");
  const [token, setToken] = useState((provider?.config.token as string) ?? "");
  const [secret, setSecret] = useState((provider?.config.secret as string) ?? "");
  const [baseUrl, setBaseUrl] = useState((provider?.config.baseUrl as string) ?? "");
  const [defaultDomain, setDefaultDomain] = useState((provider?.config.defaultDomain as string) ?? "");
  const [priority, setPriority] = useState(provider?.priority ?? 100);
  const [enabled, setEnabled] = useState(provider?.isEnabled ?? true);

  const [testTo, setTestTo] = useState("");
  const [testFrom, setTestFrom] = useState(mailboxes[0]?.address ?? "");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.saveProvider({
        id: provider?.id,
        name,
        type,
        isEnabled: enabled,
        priority,
        config:
          type === "cloudflare"
            ? { defaultDomain }
            : type === "resend"
              ? { apiKey }
              : { token, secret, baseUrl },
      });
      setMessage({ kind: "success", text: "已保存" });
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault() {
    if (!provider) return;
    await api.setDefaultProvider(provider.id);
    onChanged();
  }

  async function remove() {
    if (!provider) return;
    await api.deleteProvider(provider.id);
    onChanged();
  }

  async function test() {
    if (!provider) return;
    setBusy(true);
    setMessage(null);
    try {
      const { result } = await api.testProvider(provider.id, { from: testFrom, to: testTo });
      setMessage(
        result.success
          ? { kind: "success", text: `测试邮件已提交（${result.providerMessageId ?? "无回执 ID"}）` }
          : { kind: "error", text: result.error ?? "发送失败" },
      );
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "发送失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="provider-card">
      <div className="provider-card__head">
        <button className="btn btn--icon" type="button" onClick={() => setOpen(!open)} aria-label="展开">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="provider-card__title">
          <span className="provider-card__name">{provider?.name ?? PROVIDER_LABELS[type]}</span>
          <span className="provider-card__type">{type}</span>
        </div>

        <div className="provider-card__spacer" />

        {provider ? (
          <>
            {provider.isDefault && <span className="badge badge--primary">默认渠道</span>}
            {provider.lastError ? (
              <span className="badge badge--error">
                <CircleAlert size={12} />
                异常
              </span>
            ) : (
              <span className="badge badge--success">
                <CheckCircle2 size={12} />
                已连接
              </span>
            )}
            {!provider.isDefault && (
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => void makeDefault()}>
                设为默认
              </button>
            )}
          </>
        ) : (
          <span className="badge">未配置</span>
        )}
      </div>

      {open && (
        <div className="provider-card__body">
          <p className="settings__section-desc">{DESCRIPTIONS[type]}</p>

          {message && <div className={`alert alert--${message.kind}`}>{message.text}</div>}

          {provider?.lastError && (
            <div className="alert alert--warning">
              最近一次错误（{provider.lastCheckedAt ? formatDateTime(provider.lastCheckedAt) : "未知时间"}）：
              {provider.lastError}
            </div>
          )}

          <div className="field">
            <label className="field__label">显示名称</label>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          {type === "cloudflare" && (
            <div className="field">
              <label className="field__label">默认发信域名</label>
              <input
                className="input"
                value={defaultDomain}
                placeholder="yourdomain.com"
                onChange={(event) => setDefaultDomain(event.target.value)}
              />
              <span className="field__hint">该域名需要已在 Cloudflare 完成验证。</span>
            </div>
          )}

          {type === "resend" && (
            <div className="field">
              <label className="field__label">API Key</label>
              <input
                className="input"
                type="password"
                value={apiKey}
                placeholder={provider ? "留空表示不修改" : "re_..."}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </div>
          )}

          {type === "sendflare" && (
            <>
              <div className="field">
                <label className="field__label">API Token</label>
                <input
                  className="input"
                  type="password"
                  value={token}
                  placeholder={provider ? "留空表示不修改" : "sf_..."}
                  onChange={(event) => setToken(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label">API Secret（可选，用于 HMAC 签名）</label>
                <input
                  className="input"
                  type="password"
                  value={secret}
                  placeholder={provider ? "留空表示不修改" : "选填"}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label">API 地址</label>
                <input
                  className="input"
                  value={baseUrl}
                  placeholder="https://api.sendflare.com"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </div>
            </>
          )}

          <div className="field">
            <label className="field__label">备用优先级（数值越小越先被选中）</label>
            <input
              className="input"
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
            />
          </div>

          <label className="switch">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            启用该渠道
          </label>

          <div className="row row--wrap">
            <button className="btn" type="button" onClick={() => void save()} disabled={busy}>
              {busy ? "处理中…" : "保存"}
            </button>
            {provider && (
              <button className="btn btn--danger btn--sm" type="button" onClick={() => void remove()}>
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>

          {provider && (
            <div className="stack">
              <span className="field__label">测试发送</span>
              <div className="row row--wrap">
                <select
                  className="select"
                  value={testFrom}
                  onChange={(event) => setTestFrom(event.target.value)}
                >
                  {mailboxes.map((mailbox) => (
                    <option key={mailbox.id} value={mailbox.address}>
                      {mailbox.address}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={testTo}
                  placeholder="收件地址"
                  onChange={(event) => setTestTo(event.target.value)}
                />
                <button
                  className="btn btn--secondary"
                  type="button"
                  onClick={() => void test()}
                  disabled={busy || !testTo || !testFrom}
                >
                  <Send size={14} />
                  发送
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
