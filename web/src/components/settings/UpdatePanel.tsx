import { CheckCircle2, CircleAlert, Download, RefreshCw, Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { UpdateVersionView } from "../../lib/api";
import { api } from "../../lib/api";
import FormRow from "./FormRow";

/**
 * 界面内一键更新。
 * 保存一个更新 Token（AES-GCM 加密存 D1）后，点「一键更新」即让
 * 安装向导把最新代码部署上去——部署会复用已有数据库、存储和机密。
 */
export default function UpdatePanel() {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<{ hasToken: boolean; accountId: string | null } | null>(null);
  const [version, setVersion] = useState<UpdateVersionView | null>(null);
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);
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
      return;
    }

    try {
      setVersion(await api.updateVersion());
    } catch {
      setVersion(null);
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
      let progress = await api.updateProgress(jobId);
      while (progress.status === "running") {
        setLog(progress.log);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        progress = await api.updateProgress(jobId);
      }
      setLog(progress.log);
      if (progress.url) setResultUrl(progress.url);
      if (progress.status !== "done") {
        setMsg({ kind: "error", text: progress.error || t("update.failed") });
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

  const versionStatus = !version
    ? { label: t("update.versionUnavailable"), className: "badge" }
    : version.updateAvailable
      ? { label: t("update.updateAvailable"), className: "badge badge--warning" }
      : { label: t("update.upToDate"), className: "badge badge--success" };
  const terminalState = updating
    ? "running"
    : msg?.kind === "error" && log
      ? "failed"
      : log
        ? "done"
        : "ready";
  const TerminalStatusIcon =
    terminalState === "failed" ? CircleAlert : terminalState === "done" ? CheckCircle2 : Terminal;

  return (
    <div className="settings-panel settings-panel--update">
      <header className="panel-head panel-head--split">
        <div>
          <h1 className="panel-head__title">{t("update.title")}</h1>
          <p className="panel-head__desc">{t("update.desc")}</p>
        </div>
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={() => void checkVersion()}
          disabled={checkingVersion || updating}
        >
          <RefreshCw size={14} className={checkingVersion ? "spin" : undefined} />
          {checkingVersion ? t("update.versionChecking") : t("update.checkVersion")}
        </button>
      </header>

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

      {version?.updateAvailable && <div className="alert alert--warning">{t("update.updateAvailable")}</div>}
      {msg && <div className={`alert alert--${msg.kind}`}>{msg.text}</div>}

      <section className="update-section">
        <div className="update-section__intro">
          <div className="update-section__icon">
            <Download size={17} />
          </div>
          <div>
            <h2>{t("update.auto.title")}</h2>
            <p>{t("update.auto.desc")}</p>
          </div>
        </div>

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
          hint={
            cfg.accountId ? `${t("update.accountId.saved")}: ${cfg.accountId}` : t("update.accountId.hint")
          }
        >
          <div className="row row--wrap">
            <select
              className="select"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">{t("update.accountId.select")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--secondary"
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
      </section>

      <section className="update-runbar">
        <div>
          <h2>{t("update.run")}</h2>
          <p>{t("update.auto.desc")}</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => void runUpdate()}
          disabled={busy || updating || (!cfg.hasToken && !token)}
        >
          <Download size={15} />
          {updating ? t("update.running") : t("update.run")}
        </button>
      </section>

      {log && (
        <section className="update-terminal" aria-live="polite">
          <div className="update-terminal__bar">
            <span className="update-terminal__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="update-terminal__title">
              <Terminal size={13} />
              {t("update.terminal.title")}
            </span>
            <span className={`update-terminal__status update-terminal__status--${terminalState}`}>
              <TerminalStatusIcon size={13} />
              {t(`update.terminal.${terminalState}` as "update.terminal.ready")}
            </span>
          </div>
          <pre className="update-terminal__body">{log}</pre>
        </section>
      )}

      {resultUrl && (
        <p className="update-result">
          <a href={resultUrl} target="_blank" rel="noreferrer">
            {t("update.openApp")}
          </a>
        </p>
      )}
    </div>
  );
}
