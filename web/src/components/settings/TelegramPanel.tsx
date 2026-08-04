import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MAIL_CATEGORIES } from "../../../../src/ai/types";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n/dict";
import type { TelegramView } from "../../lib/api";
import { api } from "../../lib/api";
import FormRow from "./FormRow";
import SettingsPanel from "./SettingsPanel";
import SettingsSection from "./SettingsSection";
import { useSettingsToast } from "./SettingsToast";

/** Telegram 是独立的通知渠道，不与 AI 服务配置混在同一个设置页。 */
export default function TelegramPanel() {
  const { t } = useI18n();
  const [tg, setTg] = useState<TelegramView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { showToast, dismissToast } = useSettingsToast();
  const [busy, setBusy] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [onlyCategories, setOnlyCategories] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoadError(false);
    api.aiConfig().then(
      (result) => {
        setTg(result.telegram);
        setTgEnabled(result.telegram.enabled);
        setChatId(result.telegram.chatId ?? "");
        setOnlyCategories(result.telegram.onlyCategories ?? []);
      },
      () => setLoadError(true),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTg() {
    setBusy(true);
    dismissToast();
    try {
      const result = await api.saveTelegram({ enabled: tgEnabled, botToken, chatId, onlyCategories });
      setTg(result.telegram);
      setBotToken("");
      showToast({ kind: "success", text: t("common.saved") });
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function testTg() {
    setBusy(true);
    dismissToast();
    try {
      const result = await api.testTelegram();
      showToast(
        result.ok
          ? { kind: "success", text: t("common.saved") }
          : { kind: "error", text: result.error ?? "error" },
      );
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <SettingsPanel title={t("notifications.title")} description={t("notifications.desc")}>
        <div className="empty">
          <p>{t("list.loadError")}</p>
          <button className="btn btn--secondary btn--sm" type="button" onClick={load}>
            {t("common.refresh")}
          </button>
        </div>
      </SettingsPanel>
    );
  }

  if (!tg) {
    return (
      <SettingsPanel title={t("notifications.title")} description={t("notifications.desc")}>
        <div className="settings-loading" aria-live="polite">
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span>{t("list.loading")}</span>
        </div>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel title={t("notifications.title")} description={t("notifications.desc")}>
      <SettingsSection
        title={t("notifications.telegram.title")}
        description={t("notifications.telegram.desc")}
      >
        <FormRow label={t("notifications.telegram.enable")}>
          <label className="switch">
            <input
              type="checkbox"
              checked={tgEnabled}
              onChange={(event) => setTgEnabled(event.target.checked)}
            />
            {t("notifications.telegram.enable.label")}
          </label>
        </FormRow>

        <FormRow
          label={t("notifications.telegram.token")}
          hint={tg.hasToken ? t("providers.keepSecret") : t("notifications.telegram.token.hint")}
        >
          <input
            className="input"
            type="password"
            value={botToken}
            placeholder={tg.hasToken ? "••••••••" : "123456:ABC-..."}
            onChange={(event) => setBotToken(event.target.value)}
          />
        </FormRow>

        <FormRow label={t("notifications.telegram.chatId")} hint={t("notifications.telegram.chatId.hint")}>
          <input
            className="input"
            value={chatId}
            placeholder="123456789"
            onChange={(event) => setChatId(event.target.value)}
          />
        </FormRow>

        <FormRow label={t("notifications.telegram.only")} hint={t("notifications.telegram.only.hint")}>
          <div className="check-group">
            {MAIL_CATEGORIES.map((key) => (
              <label className="switch" key={key}>
                <input
                  type="checkbox"
                  checked={onlyCategories.includes(key)}
                  onChange={(event) =>
                    setOnlyCategories((previous) =>
                      event.target.checked
                        ? [...previous, key]
                        : previous.filter((category) => category !== key),
                    )
                  }
                />
                {t(`cat.${key}` as TranslationKey)}
              </label>
            ))}
          </div>
        </FormRow>

        <div className="form-actions">
          <button className="btn" type="button" onClick={() => void saveTg()} disabled={busy}>
            {t("common.save")}
          </button>
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => void testTg()}
            disabled={busy || !tg.hasToken}
          >
            {t("notifications.telegram.test")}
          </button>
        </div>
      </SettingsSection>
    </SettingsPanel>
  );
}
