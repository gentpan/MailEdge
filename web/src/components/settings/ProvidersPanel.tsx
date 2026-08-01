import { Check, CircleAlert } from "lucide-react";
import { useState } from "react";
import type { MailProviderType } from "../../../../src/mail/types";
import { useI18n } from "../../i18n";
import type { Mailbox, ProviderView } from "../../lib/api";
import { PROVIDER_LABELS } from "../../lib/format";
import ProviderLogo from "./ProviderLogo";
import ProviderSection from "./ProviderSection";

const ORDER: MailProviderType[] = ["cloudflare", "sendflare", "resend", "smtp"];

interface Props {
  providers: ProviderView[];
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function ProvidersPanel({ providers, mailboxes, onChanged }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<MailProviderType>("cloudflare");

  const enabled = providers.filter((item) => item.isEnabled);
  const fallbackChain = [...enabled].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.priority - b.priority;
  });

  const selectedProvider = providers.find((item) => item.type === selected);

  return (
    <div className="settings-panel settings-panel--wide">
      <header className="panel-head">
        <h1 className="panel-head__title">{t("providers.title")}</h1>
        <p className="panel-head__desc">{t("providers.desc")}</p>
      </header>

      {fallbackChain.length > 1 && (
        <div className="chain">
          <span className="chain__label">{t("providers.chain")}</span>
          <div className="chain__items">
            {fallbackChain.map((item, index) => (
              <span className="chain__item" key={item.id}>
                {index > 0 && <span className="chain__arrow">→</span>}
                <span className={index === 0 ? "chain__name chain__name--primary" : "chain__name"}>
                  {item.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 主从：左侧渠道列表，右侧展开选中渠道的配置（不再向下堆叠） */}
      <div className="master-detail">
        <div className="master-list">
          {ORDER.map((type) => {
            const provider = providers.find((item) => item.type === type);
            const configured = Boolean(provider);
            return (
              <button
                key={type}
                type="button"
                className={`master-row${selected === type ? " master-row--active" : ""}`}
                onClick={() => setSelected(type)}
              >
                <ProviderLogo type={type} />
                <span className="master-row__title">
                  <span className="master-row__name">{provider?.name ?? PROVIDER_LABELS[type]}</span>
                  <span className="master-row__meta">
                    {configured
                      ? `${t("providers.priority")} ${provider?.priority}`
                      : t("providers.unconfigured")}
                  </span>
                </span>
                {provider?.isDefault && (
                  <span className="badge badge--primary">{t("providers.default")}</span>
                )}
                {configured &&
                  (provider?.lastError ? (
                    <CircleAlert size={14} className="master-row__status master-row__status--error" />
                  ) : (
                    <Check size={14} className="master-row__status master-row__status--ok" />
                  ))}
              </button>
            );
          })}
        </div>

        <div className="master-panel">
          <ProviderSection
            key={selected}
            type={selected}
            provider={selectedProvider}
            mailboxes={mailboxes}
            onChanged={onChanged}
            embedded
          />
        </div>
      </div>
    </div>
  );
}
