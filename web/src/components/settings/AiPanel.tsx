import { useCallback, useEffect, useState } from "react";
import { MAIL_CATEGORIES } from "../../../../src/ai/types";
import { useI18n } from "../../i18n";
import type { TranslationKey } from "../../i18n/dict";
import type { AiConfigView, TelegramView } from "../../lib/api";
import { api } from "../../lib/api";
import FormRow from "./FormRow";

/** 常见服务商预设：点一下填好 endpoint 与默认模型，仍可自由改。全部 OpenAI 兼容。 */
const PRESETS: Array<{ name: string; baseUrl: string; model: string }> = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { name: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct" },
  { name: "Ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
];

export default function AiPanel() {
  const { t } = useI18n();
  const [ai, setAi] = useState<AiConfigView | null>(null);
  const [tg, setTg] = useState<TelegramView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // 表单字段
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [autoClassify, setAutoClassify] = useState(false);

  const [tgEnabled, setTgEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [onlyCategories, setOnlyCategories] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoadError(false);
    api.aiConfig().then(
      (r) => {
        setAi(r.ai);
        setTg(r.telegram);
        setEnabled(r.ai.enabled);
        setBaseUrl(r.ai.baseUrl ?? "");
        setModel(r.ai.model ?? "");
        setAutoClassify(r.ai.autoClassify ?? false);
        setTgEnabled(r.telegram.enabled);
        setChatId(r.telegram.chatId ?? "");
        setOnlyCategories(r.telegram.onlyCategories ?? []);
      },
      () => setLoadError(true),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveAi() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await api.saveAiConfig({ enabled, baseUrl, apiKey, model, autoClassify });
      setAi(result.ai);
      setApiKey("");
      setMsg({ kind: "success", text: t("common.saved") });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function testAi() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.testAiConfig();
      setMsg(r.ok ? { kind: "success", text: r.reply ?? "OK" } : { kind: "error", text: r.error ?? "error" });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveTg() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await api.saveTelegram({ enabled: tgEnabled, botToken, chatId, onlyCategories });
      setTg(result.telegram);
      setBotToken("");
      setMsg({ kind: "success", text: t("common.saved") });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function testTg() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.testTelegram();
      setMsg(
        r.ok ? { kind: "success", text: t("common.saved") } : { kind: "error", text: r.error ?? "error" },
      );
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="settings-panel">
        <div className="empty">
          <p>{t("list.loadError")}</p>
          <button className="btn btn--secondary btn--sm" type="button" onClick={load}>
            {t("common.refresh")}
          </button>
        </div>
      </div>
    );
  }

  if (!ai || !tg) return null;

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">{t("ai.title")}</h1>
        <p className="panel-head__desc">{t("ai.desc")}</p>
      </header>

      {msg && <div className={`alert alert--${msg.kind}`}>{msg.text}</div>}

      <FormRow label={t("ai.enable")}>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t("ai.enable.hint")}
        </label>
      </FormRow>

      <FormRow label={t("ai.preset")}>
        <div className="row row--wrap">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setBaseUrl(preset.baseUrl);
                setModel(preset.model);
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
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

      <FormRow label={t("ai.autoClassify")} hint={t("ai.autoClassify.hint")}>
        <label className="switch">
          <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} />
          {t("ai.autoClassify.label")}
        </label>
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

      <header className="panel-head" style={{ marginTop: "var(--space-12)" }}>
        <h2 className="panel-head__title">{t("ai.tg.title")}</h2>
        <p className="panel-head__desc">{t("ai.tg.desc")}</p>
      </header>

      <FormRow label={t("ai.tg.enable")}>
        <label className="switch">
          <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
          {t("ai.tg.enable.label")}
        </label>
      </FormRow>

      <FormRow
        label={t("ai.tg.token")}
        hint={tg.hasToken ? t("providers.keepSecret") : t("ai.tg.token.hint")}
      >
        <input
          className="input"
          type="password"
          value={botToken}
          placeholder={tg.hasToken ? "••••••••" : "123456:ABC-..."}
          onChange={(e) => setBotToken(e.target.value)}
        />
      </FormRow>

      <FormRow label={t("ai.tg.chatId")} hint={t("ai.tg.chatId.hint")}>
        <input
          className="input"
          value={chatId}
          placeholder="123456789"
          onChange={(e) => setChatId(e.target.value)}
        />
      </FormRow>

      <FormRow label={t("ai.tg.only")} hint={t("ai.tg.only.hint")}>
        <div className="check-group">
          {MAIL_CATEGORIES.map((key) => (
            <label className="switch" key={key}>
              <input
                type="checkbox"
                checked={onlyCategories.includes(key)}
                onChange={(e) =>
                  setOnlyCategories((prev) =>
                    e.target.checked ? [...prev, key] : prev.filter((c) => c !== key),
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
          {t("ai.tg.test")}
        </button>
      </div>
    </div>
  );
}
