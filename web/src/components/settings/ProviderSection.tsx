import { useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleAlert, Cloud, Send, Server, Trash2, Zap } from "lucide-react";
import { api } from "../../lib/api";
import type { Mailbox, ProviderView } from "../../lib/api";
import type { MailProviderType } from "../../../../src/mail/types";
import { PROVIDER_LABELS, formatDateTime } from "../../lib/format";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n/dict";
import FormRow from "./FormRow";

const ICONS: Record<MailProviderType, typeof Cloud> = {
  cloudflare: Cloud,
  sendflare: Zap,
  resend: Send,
  smtp: Server,
};

interface Props {
  type: MailProviderType;
  provider?: ProviderView;
  mailboxes: Mailbox[];
  onChanged: () => void;
  /** 内嵌到主从布局的右侧面板：不折叠，直接展开配置，头部由左侧列表承担 */
  embedded?: boolean;
}

export default function ProviderSection({ type, provider, mailboxes, onChanged, embedded }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(provider?.name ?? PROVIDER_LABELS[type] ?? type);
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState((provider?.config.baseUrl as string) ?? "");
  const [defaultDomain, setDefaultDomain] = useState((provider?.config.defaultDomain as string) ?? "");
  const [smtpHost, setSmtpHost] = useState((provider?.config.host as string) ?? "");
  const [smtpPort, setSmtpPort] = useState((provider?.config.port as number) ?? 587);
  const [smtpUser, setSmtpUser] = useState((provider?.config.username as string) ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpSecurity, setSmtpSecurity] = useState<"tls" | "starttls">(
    (provider?.config.security as "tls" | "starttls") ?? "starttls",
  );
  const [priority, setPriority] = useState(provider?.priority ?? 100);
  const [enabled, setEnabled] = useState(provider?.isEnabled ?? true);

  const [testTo, setTestTo] = useState("");
  const [testFrom, setTestFrom] = useState(mailboxes[0]?.address ?? "");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [domains, setDomains] = useState(((provider?.config.verifiedDomains as string[]) ?? []).join(", "));
  const [fromName, setFromName] = useState((provider?.config.fromName as string) ?? "");
  const [fetchingDomains, setFetchingDomains] = useState(false);

  const Icon = ICONS[type];
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
              ? { apiKey, verifiedDomains: domains, fromName }
              : type === "sendflare"
                ? { token, secret, baseUrl, verifiedDomains: domains, fromName }
                : {
                    host: smtpHost,
                    port: smtpPort,
                    username: smtpUser,
                    password: smtpPass,
                    security: smtpSecurity,
                  },
      });
      setMessage({ kind: "success", text: t("common.saved") });
      setApiKey("");
      setToken("");
      setSecret("");
      setSmtpPass("");
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function fetchDomains() {
    if (!provider) return;
    setFetchingDomains(true);
    setMessage(null);
    try {
      const result = await api.fetchProviderDomains(provider.id);
      setDomains(result.domains.join(", "));
      setMessage({
        kind: "success",
        text: result.domains.length ? result.domains.join("、") : t("providers.domains.empty"),
      });
      onChanged();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setFetchingDomains(false);
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
          ? { kind: "success", text: result.providerMessageId ?? "OK" }
          : { kind: "error", text: result.error ?? "error" },
      );
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  const showBody = open || embedded;

  return (
    <div
      className={`provider-block${provider?.isDefault ? " provider-block--default" : ""}${embedded ? " provider-block--embedded" : ""}`}
    >
      {!embedded && (
        <button className="provider-block__head" type="button" onClick={() => setOpen(!open)}>
          <span className="provider-block__mark">
            <Icon size={16} />
          </span>

          <span className="provider-block__title">
            <span className="provider-block__name">{provider?.name ?? PROVIDER_LABELS[type]}</span>
            <span className="provider-block__meta">
              {configured ? `${t("providers.priority")} ${provider?.priority}` : t("providers.unconfigured")}
            </span>
          </span>

          <span className="provider-block__spacer" />

          {provider?.isDefault && <span className="badge badge--primary">{t("providers.default")}</span>}
          {configured &&
            (provider?.lastError ? (
              <span className="badge badge--error">
                <CircleAlert size={12} />
                {t("providers.error")}
              </span>
            ) : (
              <span className="badge badge--success">
                <Check size={12} />
                {t("providers.connected")}
              </span>
            ))}
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      )}

      {showBody && (
        <div className="provider-block__body">
          <p className="provider-block__desc">{t(`providers.desc.${type}` as TranslationKey)}</p>

          {message && (
            <div className={`alert alert--${message.kind}`} role="status">
              {message.text}
            </div>
          )}

          {provider?.lastError && (
            <div className="alert alert--warning">
              {provider.lastCheckedAt ? formatDateTime(provider.lastCheckedAt) : ""}：{provider.lastError}
            </div>
          )}

          <FormRow label={t("providers.displayName")}>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </FormRow>

          {type === "cloudflare" && (
            <FormRow label={t("providers.cf.domain")} hint={t("providers.cf.domain.hint")}>
              <input
                className="input"
                value={defaultDomain}
                placeholder="yourdomain.com"
                onChange={(event) => setDefaultDomain(event.target.value)}
              />
            </FormRow>
          )}

          {type === "resend" && (
            <FormRow label="API Key" hint={configured ? t("providers.keepSecret") : undefined}>
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
              <FormRow label="API Token" hint={configured ? t("providers.keepSecret") : undefined}>
                <input
                  className="input"
                  type="password"
                  value={token}
                  placeholder={configured ? "••••••••" : "sf_..."}
                  onChange={(event) => setToken(event.target.value)}
                />
              </FormRow>
              <FormRow label="API Secret" hint={t("providers.secret.hint")}>
                <input
                  className="input"
                  type="password"
                  value={secret}
                  placeholder={configured ? "••••••••" : t("common.optional")}
                  onChange={(event) => setSecret(event.target.value)}
                />
              </FormRow>
              <FormRow label={t("providers.baseUrl")}>
                <input
                  className="input"
                  value={baseUrl}
                  placeholder="https://api.sendflare.com"
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </FormRow>
            </>
          )}

          {type === "smtp" && (
            <>
              <FormRow label={t("providers.smtp.preset")}>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  onClick={() => {
                    setSmtpHost("smtp.gmail.com");
                    setSmtpPort(587);
                    setSmtpSecurity("starttls");
                  }}
                >
                  Gmail
                </button>
              </FormRow>
              <FormRow label={t("providers.smtp.host")}>
                <input
                  className="input"
                  value={smtpHost}
                  placeholder="smtp.gmail.com"
                  onChange={(event) => setSmtpHost(event.target.value)}
                />
              </FormRow>
              <FormRow label={t("providers.smtp.port")}>
                <input
                  className="input"
                  type="number"
                  value={smtpPort}
                  onChange={(event) => setSmtpPort(Number(event.target.value))}
                />
              </FormRow>
              <FormRow label={t("providers.smtp.security")}>
                <select
                  className="select"
                  value={smtpSecurity}
                  onChange={(event) => setSmtpSecurity(event.target.value as "tls" | "starttls")}
                >
                  <option value="starttls">STARTTLS（587）</option>
                  <option value="tls">TLS（465）</option>
                </select>
              </FormRow>
              <FormRow label={t("providers.smtp.username")} hint={t("providers.smtp.username.hint")}>
                <input
                  className="input"
                  value={smtpUser}
                  placeholder="you@gmail.com"
                  onChange={(event) => setSmtpUser(event.target.value)}
                />
              </FormRow>
              <FormRow
                label={t("providers.smtp.password")}
                hint={configured ? t("providers.keepSecret") : t("providers.smtp.password.hint")}
              >
                <input
                  className="input"
                  type="password"
                  value={smtpPass}
                  placeholder={configured ? "••••••••" : ""}
                  onChange={(event) => setSmtpPass(event.target.value)}
                />
              </FormRow>
            </>
          )}

          <FormRow label={t("providers.priority")} hint={t("providers.priority.hint")}>
            <input
              className="input"
              type="number"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
            />
          </FormRow>

          <FormRow label={t("common.enabled")}>
            <label className="switch">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              {t("providers.enable.hint")}
            </label>
          </FormRow>

          {(type === "resend" || type === "sendflare") && (
            <>
              <FormRow label={t("providers.fromName")} hint={t("providers.fromName.hint")}>
                <input
                  className="input"
                  value={fromName}
                  placeholder="MailEdge"
                  onChange={(event) => setFromName(event.target.value)}
                />
              </FormRow>

              <FormRow label={t("providers.domains")} hint={t("providers.domains.hint")}>
                <div className="stack">
                  <textarea
                    className="textarea"
                    value={domains}
                    placeholder={t("providers.domains.placeholder")}
                    onChange={(event) => setDomains(event.target.value)}
                  />
                  {provider && (
                    <button
                      className="btn btn--secondary btn--sm"
                      type="button"
                      onClick={() => void fetchDomains()}
                      disabled={fetchingDomains}
                    >
                      {fetchingDomains ? t("providers.domains.fetching") : t("providers.domains.fetch")}
                    </button>
                  )}
                </div>
              </FormRow>
            </>
          )}

          {provider && (
            <FormRow label={t("providers.test")} hint={t("providers.test.hint")}>
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
                    placeholder={t("providers.test.to")}
                    onChange={(event) => setTestTo(event.target.value)}
                  />
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => void test()}
                    disabled={busy || !testTo || !testFrom}
                  >
                    {t("compose.send")}
                  </button>
                </div>
              </div>
            </FormRow>
          )}

          <div className="form-actions">
            <button className="btn" type="button" onClick={() => void save()} disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
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
                {t("providers.setDefault")}
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
                {t("common.delete")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
