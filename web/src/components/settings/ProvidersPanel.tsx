import type { Mailbox, ProviderView } from "../../lib/api";
import type { MailProviderType } from "../../../../src/mail/types";
import ProviderSection from "./ProviderSection";

const ORDER: MailProviderType[] = ["cloudflare", "sendflare", "resend"];

interface Props {
  providers: ProviderView[];
  mailboxes: Mailbox[];
  onChanged: () => void;
}

export default function ProvidersPanel({ providers, mailboxes, onChanged }: Props) {
  const enabled = providers.filter((item) => item.isEnabled);
  const fallbackChain = [...enabled].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.priority - b.priority;
  });

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">发信服务</h1>
        <p className="panel-head__desc">
          默认渠道优先使用。只有网络故障、429、5xx 这类临时错误才会切换到备用渠道；
          域名未验证、地址非法、内容被拒等永久性错误直接失败，不会重发。
        </p>
      </header>

      {fallbackChain.length > 1 && (
        <div className="chain">
          <span className="chain__label">当前投递顺序</span>
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
