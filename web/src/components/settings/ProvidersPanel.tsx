import type { Mailbox, ProviderView } from "../../lib/api";
import type { MailProviderType } from "../../../../src/mail/types";
import { useI18n } from "../../i18n";
import ProviderSection from "./ProviderSection";

const ORDER: MailProviderType[] = ["cloudflare", "sendflare", "resend", "smtp"];

interface Props {
  providers: ProviderView[];
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function ProvidersPanel({ providers, mailboxes, onChanged }: Props) {
  const { t } = useI18n();
  const enabled = providers.filter((item) => item.isEnabled);
  const fallbackChain = [...enabled].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.priority - b.priority;
  });

  return (
    <div className="settings-panel">
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

      {ORDER.map((type) => (
        <ProviderSection
          key={type}
          type={type}
          provider={providers.find((item) => item.type === type)}
          mailboxes={mailboxes}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}
