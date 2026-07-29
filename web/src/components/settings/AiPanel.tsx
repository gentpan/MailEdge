import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { AiConfigView, TelegramView } from "../../lib/api";
import { CATEGORY_LABELS, MAIL_CATEGORIES } from "../../../../src/ai/types";
import FormRow from "./FormRow";

export default function AiPanel() {
  const [ai, setAi] = useState<AiConfigView | null>(null);
  const [tg, setTg] = useState<TelegramView | null>(null);
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

  useEffect(() => {
    api.aiConfig().then((r) => {
      setAi(r.ai);
      setTg(r.telegram);
      setEnabled(r.ai.enabled);
      setBaseUrl(r.ai.baseUrl ?? "");
      setModel(r.ai.model ?? "");
      setAutoClassify(r.ai.autoClassify ?? false);
      setTgEnabled(r.telegram.enabled);
      setChatId(r.telegram.chatId ?? "");
      setOnlyCategories(r.telegram.onlyCategories ?? []);
    });
  }, []);

  async function saveAi() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await api.saveAiConfig({ enabled, baseUrl, apiKey, model, autoClassify });
      setAi(result.ai);
      setApiKey("");
      setMsg({ kind: "success", text: "已保存" });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  async function testAi() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.testAiConfig();
      setMsg(r.ok ? { kind: "success", text: `连通：${r.reply ?? "OK"}` } : { kind: "error", text: r.error ?? "失败" });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "失败" });
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
      setMsg({ kind: "success", text: "已保存" });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  async function testTg() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.testTelegram();
      setMsg(r.ok ? { kind: "success", text: "已推送测试消息" } : { kind: "error", text: r.error ?? "失败" });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "失败" });
    } finally {
      setBusy(false);
    }
  }

  if (!ai || !tg) return null;

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">AI 助手</h1>
        <p className="panel-head__desc">
          OpenAI 兼容接口，可接 OpenAI、转发站或本地模型。用于回复草稿、邮件总结与自动分类。
        </p>
      </header>

      {msg && <div className={`alert alert--${msg.kind}`}>{msg.text}</div>}

      <FormRow label="启用 AI">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          开启后写信与详情页出现 AI 按钮
        </label>
      </FormRow>

      <FormRow label="接口地址">
        <input
          className="input"
          value={baseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </FormRow>

      <FormRow label="API Key" hint={ai.hasKey ? "已保存，留空表示不修改" : undefined}>
        <input
          className="input"
          type="password"
          value={apiKey}
          placeholder={ai.hasKey ? "••••••••" : "sk-..."}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </FormRow>

      <FormRow label="模型">
        <input
          className="input"
          value={model}
          placeholder="gpt-4o-mini"
          onChange={(e) => setModel(e.target.value)}
        />
      </FormRow>

      <FormRow label="自动分类" hint="新信到达时自动打分类标签，收件箱按分类分栏">
        <label className="switch">
          <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} />
          收信时自动分类
        </label>
      </FormRow>

      <div className="form-actions">
        <button className="btn" type="button" onClick={() => void saveAi()} disabled={busy}>
          保存
        </button>
        <button className="btn btn--secondary" type="button" onClick={() => void testAi()} disabled={busy || !ai.hasKey}>
          测试连通
        </button>
      </div>

      <header className="panel-head" style={{ marginTop: "var(--space-12)" }}>
        <h2 className="panel-head__title">Telegram 推送</h2>
        <p className="panel-head__desc">新信到达时推送到 Telegram Bot。可只推送指定分类（需先开启自动分类）。</p>
      </header>

      <FormRow label="启用推送">
        <label className="switch">
          <input type="checkbox" checked={tgEnabled} onChange={(e) => setTgEnabled(e.target.checked)} />
          收到新信时推送
        </label>
      </FormRow>

      <FormRow label="Bot Token" hint={tg.hasToken ? "已保存，留空表示不修改" : "从 @BotFather 获取"}>
        <input
          className="input"
          type="password"
          value={botToken}
          placeholder={tg.hasToken ? "••••••••" : "123456:ABC-..."}
          onChange={(e) => setBotToken(e.target.value)}
        />
      </FormRow>

      <FormRow label="Chat ID" hint="给 Bot 发一条消息后，从 getUpdates 获取">
        <input className="input" value={chatId} placeholder="123456789" onChange={(e) => setChatId(e.target.value)} />
      </FormRow>

      <FormRow label="只推送分类" hint="不选表示全部推送">
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
              {CATEGORY_LABELS[key]}
            </label>
          ))}
        </div>
      </FormRow>

      <div className="form-actions">
        <button className="btn" type="button" onClick={() => void saveTg()} disabled={busy}>
          保存
        </button>
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => void testTg()}
          disabled={busy || !tg.hasToken}
        >
          测试推送
        </button>
      </div>
    </div>
  );
}
