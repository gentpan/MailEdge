import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { UpdateVersionView } from "../../lib/api";
import { api } from "../../lib/api";
import SettingsPanel from "./SettingsPanel";

const DEPLOYER_UPGRADE_URL = "https://mailedge.sh/";

/**
 * 版本检查入口。
 *
 * Worker 只负责读取公开的版本元数据；实际升级统一交给 mailedge.sh，
 * 用户在那里使用 Cloudflare OAuth 或一次性 Token 完成授权，避免在
 * MailEdge 实例中保存部署凭据。
 */
export default function UpdatePanel() {
  const { t } = useI18n();
  const [version, setVersion] = useState<UpdateVersionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingVersion, setCheckingVersion] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVersion(await api.updateVersion());
    } catch {
      setVersion(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkVersion() {
    setCheckingVersion(true);
    try {
      setVersion(await api.updateVersion());
    } catch {
      setVersion(null);
    } finally {
      setCheckingVersion(false);
    }
  }

  if (loading) {
    return (
      <SettingsPanel title={t("update.title")} description={t("update.desc")}>
        <div className="empty">
          <RefreshCw size={20} className="spin" />
          <p>{t("list.loading")}</p>
        </div>
      </SettingsPanel>
    );
  }

  const versionStatus = !version
    ? { label: t("update.versionUnavailable"), className: "badge" }
    : version.updateAvailable
      ? { label: t("update.updateAvailable"), className: "badge badge--warning" }
      : { label: t("update.upToDate"), className: "badge badge--success" };

  return (
    <SettingsPanel
      className="settings-panel--update"
      title={t("update.title")}
      description={t("update.desc")}
      action={
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={() => void checkVersion()}
          disabled={checkingVersion}
        >
          <RefreshCw size={14} className={checkingVersion ? "spin" : undefined} />
          {checkingVersion ? t("update.versionChecking") : t("update.checkVersion")}
        </button>
      }
    >
      <section className="update-version" aria-label={t("update.version")}>
        <div className="update-version__heading">
          <div>
            <span className="eyebrow">{t("update.version")}</span>
            <p className="text-secondary">
              {version?.source ? "MailEdge deployer" : t("update.versionUnavailable")}
            </p>
          </div>
          <span className={versionStatus.className}>{versionStatus.label}</span>
        </div>
        <div className="update-version__grid">
          <div className="update-version__card">
            <span className="update-version__label">{t("update.currentVersion")}</span>
            <strong className="update-version__value mono">{version?.currentVersion ?? "—"}</strong>
          </div>
          <div className="update-version__card update-version__card--target">
            <span className="update-version__label">{t("update.latestVersion")}</span>
            <strong className="update-version__value mono">{version?.availableVersion ?? "—"}</strong>
          </div>
        </div>
      </section>

      {version?.updateAvailable ? (
        <section className="update-redirect update-redirect--available" aria-live="polite">
          <div>
            <h2>{t("update.redirect.title")}</h2>
            <p>{t("update.redirect.desc")}</p>
          </div>
          <a className="btn" href={DEPLOYER_UPGRADE_URL}>
            <ExternalLink size={15} />
            {t("update.redirect.open")}
          </a>
        </section>
      ) : version ? (
        <section className="update-redirect update-redirect--current" aria-live="polite">
          <div>
            <h2>{t("update.upToDate")}</h2>
            <p>{t("update.redirect.current")}</p>
          </div>
          <a className="btn btn--secondary" href={DEPLOYER_UPGRADE_URL}>
            <ExternalLink size={15} />
            {t("update.redirect.open")}
          </a>
        </section>
      ) : (
        <div className="alert alert--warning" role="status">
          {t("update.versionUnavailable")}
        </div>
      )}
    </SettingsPanel>
  );
}
