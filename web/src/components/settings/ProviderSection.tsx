import { useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleAlert, Cloud, Send, Trash2, Zap } from "lucide-react";
import { api } from "../../lib/api";
import type { Mailbox, ProviderView } from "../../lib/api";
import type { MailProviderType } from "../../../../src/mail/types";
import { PROVIDER_LABELS, formatDateTime } from "../../lib/format";
import FormRow from "./FormRow";

const META: Record<MailProviderType, { icon: typeof Cloud; desc: string }> = {
  cloudflare: {
    icon: Cloud,
    desc: "Workers 原生绑定，无额外 HTTP 请求。单封上限 5 MiB、最多 32 个附件；发往任意外部邮箱需要 Workers Paid。",
  },
  sendflare: { icon: Zap, desc: "REST API，Bearer Token 认证，可选 HMAC-SHA256 签名。" },
  resend: { icon: Send, desc: "成熟的第三方发信服务，需要在 Resend 后台完成域名验证。" },
};

interface Props {
  type: MailProviderType;
  provider?: ProviderView;
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function ProviderSection({ type, provider, mailboxes, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(provider?.name ?? PROVIDER_LABELS[type] ?? type);
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState((provider?.config.baseUrl as string) ?? "");
  const [defaultDomain, setDefaultDomain] = useState((provider?.config.defaultDomain as string) ?? "");
  const [priority, setPriority] = useState(provider?.priority ?? 100);
  const [enabled, setEnabled] = useState(provider?.isEnabled ?? true);

  const [testTo, setTestTo] = useState("");
  const [testFrom, setTestFrom] = useState(mailboxes[0]?.address ?? "");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const Icon = META[type].icon;
  const configured = Boolean(provider);

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
      setApiKey("");
      setToken("");
      setSecret("");
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(false);
    }
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
    <div className={`provider-block${provider?.isDefault ? " provider-block--default" : ""}`}>
      <button className="provider-block__head" type="button" onClick={() => setOpen(!open)}>
        <span className="provider-block__mark">
          <Icon size={16} />
        </span>

        <span className="provider-block__title">
          <span className="provider-block__name">{provider?.name ?? PROVIDER_LABELS[type]}</span>
          <span className="provider-block__meta">
            {configured ? `优先级 ${provider?.priority}` : "未配置"}
          </span>
        </span>

        <span className="provider-block__spacer" />

        {provider?.isDefault && <span className="badge badge--primary">默认</span>}
        {configured &&
          (provider?.lastError ? (
            <span className="badge badge--error">
              <CircleAlert size={12} />
              异常
            </span>
          ) : (
            <span className="badge badge--success">
              <Check size={12} />
              已连接
            </span>
          ))}
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>

      {open && (
        <div className="provider-block__body">
          <p className="provider-block__desc">{META[type].desc}</p>

          {message && (
            <div className={`alert alert--${message.kind}`} role="status">
              {message.text}
            </div>
          )}

          {provider?.lastError && (
            <div className="alert alert--warning">
              最近一次错误（{provider.lastCheckedAt ? formatDateTime(provider.lastCheckedAt) : "未知时间"}）：
              {provider.lastError}
            </div>
          )}

          <FormRow label="显示名称">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </FormRow>

          {type === "cloudflare" && (
            <FormRow label="发信域名" hint="需已在 Cloudflare 完成验证">
              <input
                className="input"
                value={defaultDomain}
                placeholder="yourdomain.com"
                onChange={(event) => setDefaultDomain(event.target.value)}
              />
            </FormRow>
          )}

          {type === "resend" && (
            <FormRow label="API Key" hint={configured ? "当前：已保存，留空表示不修改" : undefined}>
              <input
                className="input"
                type="password"
                value={apiKey}
                placeholder={configured ? "••••••••" : "re_..."}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </FormRow>
          )}

          {type === "sendflare" && (
            <>
              <FormRow label="API Token" hint={configured ? "留空表示不修改" : undefined}>
                <input
                  className="input"
                  type="password"
                  value={token}
                  placeholder={configured ? "••••••••" : "sf_..."}
                  onChange={(event) => setToken(event.target.value)}
                />
              </FormRow>
              <FormRow label="API Secret" hint="可选，用于 HMAC 签名">
                <input
                  className="input"
                  type="password"
                  value={secret}
                  placeholder={configured ? "••••••••" : "选填"}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </FormRow>
              <FormRow label="API 地址">
                <input
                  className="input"
                  value={baseUrl}
                  placeholder="https://api.sendflare.com"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </FormRow>
            </>
          )}

          <FormRow label="备用优先级" hint="数值越小越先被选中">
            <input
              className="input"
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
            />
          </FormRow>

          <FormRow label="启用">
            <label className="switch">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              参与发信与备用切换
            </label>
          </FormRow>

          {provider && (
            <FormRow label="测试发送" hint="不经过状态机，直接用该渠道发一封">
              <div className="stack">
                <select className="select" value={testFrom} onChange={(event) => setTestFrom(event.target.value)}>
                  {mailboxes.map((mailbox) => (
                    <option key={mailbox.id} value={mailbox.address}>
                      {mailbox.address}
                    </option>
                  ))}
                </select>
                <div className="row">
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
                    发送
                  </button>
                </div>
              </div>
            </FormRow>
          )}

          <div className="form-actions">
            <button className="btn" type="button" onClick={() => void save()} disabled={busy}>
              {busy ? "处理中…" : "保存"}
            </button>

            {provider && !provider.isDefault && (
              <button
                className="btn btn--secondary"
                type="button"
                onClick={async () => {
                  await api.setDefaultProvider(provider.id);
                  onChanged();
                }}
              >
                设为默认
              </button>
            )}

            <div className="form-actions__spacer" />

            {provider && (
              <button
                className="btn btn--ghost btn--sm"
                type="button"
                onClick={async () => {
                  await api.deleteProvider(provider.id);
                  onChanged();
                }}
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
