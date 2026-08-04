import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { AiConfigView } from "../../lib/api";
import { api } from "../../lib/api";
import FormRow from "./FormRow";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

export default function AiPanel() {
  const { t } = useI18n();
  const [ai, setAi] = useState<AiConfigView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { showToast, dismissToast } = useSettingsToast();
  const [busy, setBusy] = useState(false);

  // 表单字段
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  const load = useCallback(() => {
    setLoadError(false);
    api.aiConfig().then(
      (r) => {
        setAi(r.ai);
        setEnabled(r.ai.enabled);
        setBaseUrl(r.ai.baseUrl ?? "");
        setModel(r.ai.model ?? "");
      },
      () => setLoadError(true),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveAi() {
    setBusy(true);
    dismissToast();
    try {
      const result = await api.saveAiConfig({ enabled, baseUrl, apiKey, model });
      setAi(result.ai);
      setApiKey("");
      showToast({ kind: "success", text: t("common.saved") });
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function testAi() {
    setBusy(true);
    dismissToast();
    try {
      const r = await api.testAiConfig();
      showToast(
        r.ok ? { kind: "success", text: r.reply ?? "OK" } : { kind: "error", text: r.error ?? "error" },
      );
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <SettingsPanel title={t("ai.title")} description={t("ai.desc")}>
        <div className="empty">
          <p>{t("list.loadError")}</p>
          <button className="btn btn--secondary btn--sm" type="button" onClick={load}>
            {t("common.refresh")}
          </button>
        </div>
      </SettingsPanel>
    );
  }

  if (!ai) {
    return (
      <SettingsPanel title={t("ai.title")} description={t("ai.desc")}>
        <div className="settings-loading" aria-live="polite">
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span>{t("list.loading")}</span>
        </div>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel title={t("ai.title")} description={t("ai.desc")}>
      <FormRow label={t("ai.enable")}>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("ai.enable.hint")}
        </label>
      </FormRow>

      <FormRow label={t("ai.baseUrl")}>
        <input
          className="input"
          value={baseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </FormRow>

      <FormRow label={t("ai.apiKey")} hint={ai.hasKey ? t("providers.keepSecret") : undefined}>
        <input
          className="input"
          type="password"
          value={apiKey}
          placeholder={ai.hasKey ? "••••••••" : "sk-..."}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </FormRow>

      <FormRow label={t("ai.model")}>
        <input
          className="input"
          value={model}
          placeholder="gpt-4o-mini"
          onChange={(e) => setModel(e.target.value)}
        />
      </FormRow>

      <div className="form-actions">
        <button className="btn" type="button" onClick={() => void saveAi()} disabled={busy}>
          {t("common.save")}
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => void testAi()}
          disabled={busy || !ai.hasKey}
        >
          {t("ai.test")}
        </button>
      </div>
    </SettingsPanel>
  );
}
