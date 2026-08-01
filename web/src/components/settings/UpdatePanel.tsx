import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import FormRow from "./FormRow";

/**
 * 界面内一键更新。
 * 保存一个更新 Token（AES-GCM 加密存 D1）后，点「一键更新」即让
 * 安装向导把最新代码部署上去——幂等复用已有数据库/存储/机密。
 */
export default function UpdatePanel() {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<{ hasToken: boolean; accountId: string | null } | null>(null);
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [log, setLog] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  const load = useCallback(async () => {
    try {
      setCfg(await api.updateConfig());
    } catch {
      setCfg(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function fetchAccounts() {
    if (!token.trim()) return setMsg({ kind: "error", text: t("update.fetchAccount.hint") });
    setFetchingAccounts(true);
    setMsg(null);
    try {
      const r = await api.updateAccounts(token.trim());
      setAccounts(r.accounts ?? []);
      if (!r.accounts?.length) setMsg({ kind: "error", text: t("update.token.noAccount") });
      else setMsg({ kind: "success", text: t("update.fetchAccount.done") });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setFetchingAccounts(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const next = await api.saveUpdateConfig({
        token: token || undefined,
        accountId: accountId || undefined,
      });
      setCfg(next);
      setToken("");
      setAccountId("");
      setMsg({ kind: "success", text: t("common.saved") });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm(t("update.clear.confirm"))) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.saveUpdateConfig({ token: "", accountId: "" });
      setCfg({ hasToken: false, accountId: null });
      setMsg({ kind: "success", text: t("update.cleared") });
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setBusy(false);
    }
  }

  async function runUpdate() {
    setUpdating(true);
    setMsg(null);
    setLog("");
    setResultUrl("");
    try {
      const { jobId } = await api.runUpdate({ token: token || undefined, accountId: accountId || undefined });
      let done = false;
      while (!done) {
        const progress = await api.updateProgress(jobId);
        setLog(progress.log);
        if (progress.status !== "running") done = true;
        else await new Promise((r) => setTimeout(r, 1500));
      }
      const final = await api.updateProgress(jobId);
      setLog(final.log);
      if (final.url) setResultUrl(final.url);
      if (final.status !== "done") {
        setMsg({ kind: "error", text: final.error || t("update.failed") });
      } else {
        setMsg({ kind: "success", text: t("update.done") });
      }
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "error" });
    } finally {
      setUpdating(false);
    }
  }

  if (!cfg) {
    return (
      <div className="settings-panel">
        <div className="empty">
          <RefreshCw size={20} className="spin" />
          <p>{t("list.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">{t("update.title")}</h1>
        <p className="panel-head__desc">{t("update.desc")}</p>
      </header>

      {msg && <div className={`alert alert--${msg.kind}`}>{msg.text}</div>}

      <FormRow
        label={t("update.token")}
        hint={cfg.hasToken ? t("update.token.saved") : t("update.token.hint")}
      >
        <input
          className="input"
          type="password"
          value={token}
          placeholder={cfg.hasToken ? "••••••••" : "cfut_…"}
          onChange={(event) => setToken(event.target.value)}
        />
      </FormRow>

      <FormRow
        label={t("update.accountId")}
        hint={cfg.accountId ? `${t("update.accountId.saved")}: ${cfg.accountId}` : t("update.accountId.hint")}
      >
        <div className="row">
          <select
            className="select"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="">{t("update.accountId.select")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void fetchAccounts()}
            disabled={busy || updating || fetchingAccounts || !token.trim()}
          >
            {fetchingAccounts ? t("update.fetchAccount.loading") : t("update.fetchAccount")}
          </button>
        </div>
      </FormRow>

      <div className="form-actions">
        <button className="btn" type="button" onClick={() => void save()} disabled={busy || updating}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        {cfg.hasToken && (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => void clear()}
            disabled={busy || updating}
          >
            {t("update.clear")}
          </button>
        )}
      </div>

      <div className="form-actions" style={{ marginTop: "var(--space-6)" }}>
        <button
          className="btn"
          type="button"
          onClick={() => void runUpdate()}
          disabled={busy || updating || (!cfg.hasToken && !token)}
        >
          {updating ? t("update.running") : t("update.run")}
        </button>
      </div>

      {updating && (
        <pre className="log" style={{ display: "block" }}>
          {log}
        </pre>
      )}

      {resultUrl && (
        <p className="text-sm">
          <a href={resultUrl} target="_blank" rel="noreferrer">
            {t("update.openApp")}
          </a>
        </p>
      )}
    </div>
  );
}
