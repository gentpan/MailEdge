import { Database, HardDrive, Loader2, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import type { StorageBackend, StorageConfigView } from "../../lib/api";
import { api } from "../../lib/api";
import FormRow from "./FormRow";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

export default function StoragePanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<StorageConfigView | null>(null);
  const [backend, setBackend] = useState<StorageBackend>("r2");
  const [retentionDays, setRetentionDays] = useState<90 | 180 | 365>(365);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { showToast, dismissToast } = useSettingsToast();

  const load = useCallback(async () => {
    setLoading(true);
    dismissToast();
    try {
      const next = await api.storageConfig();
      setConfig(next);
      setBackend(next.backend);
      setRetentionDays(next.outboundRetentionDays);
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : t("list.loadError") });
    } finally {
      setLoading(false);
    }
  }, [dismissToast, showToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    dismissToast();
    try {
      const next = await api.saveStorageConfig(backend);
      setConfig(next);
      setBackend(next.backend);
      await api.saveOutboundRetention(retentionDays);
      showToast({ kind: "success", text: t("storage.saved") });
    } catch (error) {
      showToast({ kind: "error", text: error instanceof Error ? error.message : t("toast.actionFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !config) {
    return (
      <SettingsPanel title={t("storage.title")} description={t("storage.desc")}>
        <div className="empty">
          <Loader2 size={20} className="spin" />
          <p>{t("list.loading")}</p>
        </div>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel
      title={t("storage.title")}
      description={t("storage.desc")}
      action={
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "spin" : undefined} />
          {t("common.refresh")}
        </button>
      }
    >
      {config && (
        <>
          <FormRow label={t("storage.backend")} hint={t("storage.backend.hint")} wide>
            <div className="storage-options" role="radiogroup" aria-label={t("storage.backend")}>
              <label className={`storage-option${backend === "r2" ? " storage-option--selected" : ""}`}>
                <input
                  type="radio"
                  name="storage-backend"
                  value="r2"
                  checked={backend === "r2"}
                  disabled={!config.r2Available || busy}
                  onChange={() => setBackend("r2")}
                />
                <HardDrive size={20} />
                <span>
                  <strong>{t("storage.r2.title")}</strong>
                  <small>{config.r2Available ? t("storage.available") : t("storage.unavailable")}</small>
                </span>
              </label>
              <label className={`storage-option${backend === "kv" ? " storage-option--selected" : ""}`}>
                <input
                  type="radio"
                  name="storage-backend"
                  value="kv"
                  checked={backend === "kv"}
                  disabled={!config.kvAvailable || busy}
                  onChange={() => setBackend("kv")}
                />
                <Database size={20} />
                <span>
                  <strong>{t("storage.kv.title")}</strong>
                  <small>{config.kvAvailable ? t("storage.available") : t("storage.unavailable")}</small>
                </span>
              </label>
            </div>
          </FormRow>

          <div className="alert alert--info storage-note">
            <strong>{t("storage.switch.title")}</strong>
            <span>{t("storage.switch.desc")}</span>
          </div>
          <p className="text-secondary storage-limit">
            {backend === "kv" ? t("storage.kv.limit") : t("storage.r2.desc")}
          </p>

          <FormRow label={t("storage.retention")} hint={t("storage.retention.hint")} wide>
            <select
              className="input"
              value={retentionDays}
              disabled={busy}
              onChange={(event) => setRetentionDays(Number(event.target.value) as 90 | 180 | 365)}
            >
              {config.outboundRetentionOptions.map((days) => (
                <option key={days} value={days}>
                  {t("storage.retention.option", { n: days })}
                </option>
              ))}
            </select>
          </FormRow>

          <div className="form-actions">
            <button
              className="btn"
              type="button"
              onClick={() => void save()}
              disabled={busy || !(backend === "r2" ? config.r2Available : config.kvAvailable)}
            >
              {busy ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </>
      )}
    </SettingsPanel>
  );
}
