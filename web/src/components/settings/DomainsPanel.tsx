import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Copy,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "../icons";
import Spinner from "../Spinner";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

interface ManagedDomain {
  domain: string;
  dkim: boolean;
}

type RecordKey = "mx" | "spf" | "dkim" | "dmarc" | "webmail";

interface DnsRecord {
  key: RecordKey;
  label: string;
  host: string;
  fqdn: string;
  type: "MX" | "TXT" | "A";
  priority?: number;
  value: string;
  required: boolean;
  description: string;
}

type CheckStatus = "ok" | "mismatch" | "missing" | "error";

interface RecordCheck {
  key: RecordKey;
  status: CheckStatus;
  found: string[];
  message: string;
}

interface CheckResult {
  ready: boolean;
  checks: RecordCheck[];
  checkedAt: number;
}

type Provider = "cloudflare" | "dnspod";
type ApplyStatus = "created" | "updated" | "unchanged" | "conflict" | "error";

interface ApplyResult {
  key: RecordKey;
  status: ApplyStatus;
  message: string;
}

const APPLY_META: Record<ApplyStatus, { color: string; text: string }> = {
  created: { color: "#059669", text: "已添加" },
  updated: { color: "#059669", text: "已更新" },
  unchanged: { color: "var(--color-text-secondary)", text: "无需修改" },
  conflict: { color: "#d97706", text: "需留意" },
  error: { color: "#dc2626", text: "失败" },
};

const PROVIDER_HELP: Record<Provider, ReactNode> = {
  cloudflare: (
    <>
      在 Cloudflare 控制台「我的个人资料 → API 令牌 → 创建令牌」，选择「编辑区域
      DNS」模板，区域资源选这个域名（或所有区域），创建后复制令牌。
    </>
  ),
  dnspod: (
    <>在 DNSPod 控制台「账号中心 → API 密钥 → DNSPod Token」创建密钥，会得到一个 ID（数字）和一个 Token。</>
  ),
};

/** 打开配置弹窗后每隔多久自动重新检测一次 */
const AUTO_CHECK_MS = 20_000;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data as T;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 非 HTTPS 或权限被拒时退回到老办法
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function recordsAsText(domain: string, records: DnsRecord[]) {
  const lines = [`【${domain}】DNS 解析记录`, ""];
  for (const r of records) {
    lines.push(`# ${r.label}${r.required ? "" : "（可选）"}`);
    lines.push(`主机记录：${r.host}`);
    lines.push(`记录类型：${r.type}`);
    if (r.priority !== undefined) lines.push(`优先级：${r.priority}`);
    lines.push(`记录值：${r.value}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 999,
  padding: "16px",
};

function Modal({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div style={overlay}>
      <div
        style={{
          background: "var(--color-bg)",
          borderRadius: "var(--radius-lg)",
          padding: "1.5rem",
          width: `${width}px`,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

const STATUS_META: Record<CheckStatus | "pending", { color: string; text: string; icon: ReactNode }> = {
  ok: { color: "#059669", text: "已生效", icon: <CheckCircle2 size={14} /> },
  mismatch: { color: "#d97706", text: "不一致", icon: <AlertTriangle size={14} /> },
  missing: { color: "#dc2626", text: "未检测到", icon: <XCircle size={14} /> },
  error: { color: "#dc2626", text: "查询失败", icon: <XCircle size={14} /> },
  pending: { color: "var(--color-text-tertiary)", text: "待检测", icon: <CircleDashed size={14} /> },
};

function StatusBadge({ status, optional }: { status: CheckStatus | "pending"; optional?: boolean }) {
  const meta =
    optional && status === "missing" ? { ...STATUS_META.pending, text: "未配置" } : STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12px",
        fontWeight: 500,
        color: meta.color,
      }}
    >
      {meta.icon}
      {meta.text}
    </span>
  );
}

function CopyField({
  label,
  value,
  mono,
  onCopied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopied: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", lineHeight: 1.6 }}>
      <span style={{ flexShrink: 0, width: "64px", color: "var(--color-text-secondary)" }}>{label}</span>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          wordBreak: "break-all",
          fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined,
          fontSize: mono ? "12px" : "13px",
          background: "var(--color-neutral-50)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm, 6px)",
          padding: "2px 8px",
          maxHeight: "96px",
          overflowY: "auto",
        }}
      >
        {value || "—"}
      </code>
      <button
        type="button"
        className="btn btn--outline"
        title={`复制${label}`}
        style={{ flexShrink: 0, padding: "3px 8px", fontSize: "12px" }}
        disabled={!value}
        onClick={async () => {
          await copyText(value);
          onCopied();
        }}
      >
        <Copy size={12} />
      </button>
    </div>
  );
}

export default function DomainsPanel() {
  const { showToast, dismissToast } = useSettingsToast();

  const [domains, setDomains] = useState<ManagedDomain[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  const [guide, setGuide] = useState<{ domain: string; records: DnsRecord[] } | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, boolean | undefined>>({});

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // 一键配置：凭据只保存在当前弹窗的内存里，关闭即清空
  const [provider, setProvider] = useState<Provider>("cloudflare");
  const [apiId, setApiId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ domains: ManagedDomain[]; isSuperAdmin: boolean }>("/domains");
      setDomains(data.domains || []);
      setIsSuper(!!data.isSuperAdmin);
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "加载域名失败" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  // ---------- 检测 ----------
  const guideDomain = guide?.domain;
  const checkSeq = useRef(0);

  const runCheck = useCallback(
    async (domain: string, silent = false) => {
      const seq = ++checkSeq.current;
      setChecking(true);
      try {
        const data = await api<CheckResult>(`/domains/${encodeURIComponent(domain)}/check`);
        if (seq !== checkSeq.current) return data;
        setCheck(data);
        setStatusMap((m) => ({ ...m, [domain]: data.ready }));
        if (!silent) {
          showToast(
            data.ready
              ? { kind: "success", text: `${domain} 的解析已全部生效，可以开始收发邮件` }
              : {
                  kind: "error",
                  text: "部分记录尚未生效。DNS 生效通常需要几分钟，弹窗打开期间会自动重新检测",
                },
          );
        }
        return data;
      } catch (err: any) {
        if (!silent) showToast({ kind: "error", text: err.message || "检测失败" });
        return null;
      } finally {
        if (seq === checkSeq.current) setChecking(false);
      }
    },
    [showToast],
  );

  // 弹窗打开期间自动轮询，全部生效后停止
  useEffect(() => {
    if (!guideDomain || check?.ready) return;
    const timer = setInterval(() => void runCheck(guideDomain, true), AUTO_CHECK_MS);
    return () => clearInterval(timer);
  }, [guideDomain, check?.ready, runCheck]);

  async function openGuide(domain: string, records?: DnsRecord[]) {
    dismissToast();
    setCheck(null);
    try {
      const recs =
        records ??
        (await api<{ records: DnsRecord[] }>(`/domains/${encodeURIComponent(domain)}/dns`)).records;
      setGuide({ domain, records: recs });
      void runCheck(domain, true);
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "获取解析配置失败" });
    }
  }

  function closeGuide() {
    checkSeq.current++;
    setGuide(null);
    setCheck(null);
    setChecking(false);
    setApiId("");
    setApiToken("");
    setApplyResults(null);
  }

  async function handleApply(e?: React.FormEvent) {
    e?.preventDefault();
    if (!guide) return;
    setApplying(true);
    setApplyResults(null);
    dismissToast();
    try {
      const data = await api<{ results: ApplyResult[] }>(
        `/domains/${encodeURIComponent(guide.domain)}/dns/apply`,
        {
          method: "POST",
          body: JSON.stringify({ provider, id: apiId.trim(), token: apiToken.trim() }),
        },
      );
      setApplyResults(data.results);
      const failed = data.results.filter((r) => r.status === "error").length;
      showToast(
        failed
          ? { kind: "error", text: `有 ${failed} 条记录写入失败，请查看下方说明` }
          : { kind: "success", text: "解析记录已写入，正在检测是否生效…" },
      );
      setApiToken("");
      // 服务商那边生效通常要几秒，稍等再查
      window.setTimeout(() => void runCheck(guide.domain, true), 3000);
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "一键配置失败" });
    } finally {
      setApplying(false);
    }
  }

  // ---------- 添加 / 删除 ----------
  async function handleAdd(e?: React.FormEvent) {
    e?.preventDefault();
    const domain = newDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!domain) return;
    setBusy(true);
    dismissToast();
    try {
      const data = await api<{ domain: string; records: DnsRecord[] }>("/domains", {
        method: "POST",
        body: JSON.stringify({ domain }),
      });
      setShowAdd(false);
      setNewDomain("");
      showToast({ kind: "success", text: `域名 ${data.domain} 已添加，请按提示配置 DNS 解析` });
      void loadDomains();
      void openGuide(data.domain, data.records);
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "添加域名失败" });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    dismissToast();
    try {
      await api(`/domains/${encodeURIComponent(deleteTarget)}`, { method: "DELETE" });
      showToast({ kind: "success", text: `域名 ${deleteTarget} 已移除` });
      setDeleteTarget(null);
      void loadDomains();
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "删除域名失败" });
    } finally {
      setBusy(false);
    }
  }

  const checkOf = (key: RecordKey) => check?.checks.find((c) => c.key === key);
  const copied = () => showToast({ kind: "success", text: "已复制到剪贴板" });

  return (
    <SettingsPanel
      title="域名管理"
      description="添加要收发邮件的域名。添加后系统会自动配置 Postfix 虚拟域并生成 2048 位 DKIM 密钥，按提示在域名服务商处添加解析记录，再一键检测是否生效。"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Globe size={18} style={{ color: "var(--color-primary)" }} />
          <span style={{ fontSize: "14px", fontWeight: 500 }}>已添加的域名（共 {domains.length} 个）</span>
        </div>
        {isSuper && (
          <button
            type="button"
            className="btn btn--primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.4rem 0.8rem",
              fontSize: "13px",
            }}
            onClick={() => setShowAdd(true)}
          >
            <Plus size={15} />
            添加域名
          </button>
        )}
      </div>

      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "2rem",
            color: "var(--color-text-secondary)",
          }}
        >
          <Loader2 size={24} className="spin" />
        </div>
      ) : domains.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--color-text-tertiary)",
            fontSize: "13px",
          }}
        >
          还没有添加任何域名
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
            <thead>
              <tr
                style={{
                  background: "var(--color-neutral-50)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>域名</th>
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>DKIM 密钥</th>
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>解析状态</th>
                <th style={{ padding: "10px 14px", fontWeight: 500, textAlign: "right" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => {
                const ready = statusMap[d.domain];
                return (
                  <tr key={d.domain} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>{d.domain}</td>
                    <td style={{ padding: "10px 14px", color: d.dkim ? "#059669" : "#dc2626" }}>
                      {d.dkim ? "已生成（2048 位）" : "未生成"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {ready === undefined ? (
                        <StatusBadge status="pending" />
                      ) : ready ? (
                        <StatusBadge status="ok" />
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "#d97706",
                          }}
                        >
                          <AlertTriangle size={14} />
                          未全部生效
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn--outline"
                          style={{ padding: "3px 8px", fontSize: "12px" }}
                          onClick={() => void openGuide(d.domain)}
                        >
                          解析配置与检测
                        </button>
                        {isSuper && (
                          <button
                            type="button"
                            className="btn btn--danger"
                            style={{ padding: "3px 8px", fontSize: "12px" }}
                            onClick={() => setDeleteTarget(d.domain)}
                          >
                            <Trash2 size={12} style={{ marginRight: "3px" }} />
                            移除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 弹窗：添加域名 */}
      {showAdd && (
        <Modal width={440}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>添加邮件域名</h3>
            <button
              type="button"
              className="btn btn--outline"
              style={{ padding: "4px", borderRadius: "50%" }}
              onClick={() => setShowAdd(false)}
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleAdd}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                marginBottom: "4px",
              }}
            >
              域名（不带 www 或 mail 前缀）
            </label>
            <input
              type="text"
              className="input"
              placeholder="例如：example.com"
              required
              autoFocus
              style={{ width: "100%", marginBottom: "0.6rem" }}
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            />
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-text-tertiary)",
                margin: "0 0 1.2rem",
                lineHeight: 1.6,
              }}
            >
              添加后会自动配置收信路由并生成 DKIM 签名密钥，随后弹出需要在域名服务商处添加的解析记录。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setShowAdd(false)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="submit"
                className={`btn btn--primary${busy ? " btn--loading" : ""}`}
                disabled={busy}
                aria-busy={busy}
                aria-label={busy ? "正在配置" : undefined}
              >
                <span className="btn__label">添加并生成解析记录</span>
                {busy && <Spinner />}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 弹窗：DNS 解析配置 + 检测 */}
      {guide && (
        <Modal width={720}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "0.8rem",
              gap: "1rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>
                配置 {guide.domain} 的 DNS 解析
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  margin: "4px 0 0",
                  lineHeight: 1.6,
                }}
              >
                到域名服务商（阿里云、腾讯云、Cloudflare
                等）的解析控制台逐条添加以下记录。添加完成后点“检测解析”， 此窗口打开期间也会每{" "}
                {AUTO_CHECK_MS / 1000} 秒自动检测一次。
              </p>
            </div>
            <button
              type="button"
              className="btn btn--outline"
              style={{ padding: "4px", borderRadius: "50%", flexShrink: 0 }}
              onClick={closeGuide}
            >
              <X size={16} />
            </button>
          </div>

          {check && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                marginBottom: "0.8rem",
                fontSize: "13px",
                background: check.ready ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                color: check.ready ? "#047857" : "#b45309",
              }}
            >
              {check.ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span style={{ flex: 1 }}>
                {check.ready
                  ? "必需记录已全部生效，此域名可以正常收发邮件了。"
                  : "还有记录未生效。刚添加的记录通常需要几分钟到几小时才能全球生效。"}
              </span>
              <span style={{ fontSize: "11px", opacity: 0.8 }}>
                上次检测 {new Date(check.checkedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          <form
            onSubmit={handleApply}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "0.8rem 1rem",
              marginBottom: "0.8rem",
              background: "var(--color-neutral-50)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginBottom: "0.6rem",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <Wand2 size={15} style={{ color: "var(--color-primary)" }} />
                一键配置（推荐）
              </span>
              <div style={{ display: "inline-flex", gap: "4px" }}>
                {(["cloudflare", "dnspod"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={provider === p ? "btn btn--primary" : "btn btn--outline"}
                    style={{ padding: "3px 10px", fontSize: "12px" }}
                    onClick={() => {
                      setProvider(p);
                      setApplyResults(null);
                    }}
                  >
                    {p === "cloudflare" ? "Cloudflare" : "DNSPod"}
                  </button>
                ))}
              </div>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-text-secondary)",
                margin: "0 0 0.6rem",
                lineHeight: 1.6,
              }}
            >
              {PROVIDER_HELP[provider]} 密钥只用于本次写入，不会保存在服务器上。
            </p>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {provider === "dnspod" && (
                <input
                  type="text"
                  className="input"
                  placeholder="ID"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  style={{ width: "120px" }}
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                />
              )}
              <input
                type="password"
                className="input"
                placeholder={provider === "cloudflare" ? "Cloudflare API 令牌" : "Token"}
                autoComplete="off"
                required
                style={{ flex: 1, minWidth: "180px" }}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn--primary"
                disabled={applying}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {applying ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
                {applying ? "正在写入..." : "一键写入解析"}
              </button>
            </div>
            {applyResults && (
              <div
                style={{
                  marginTop: "0.6rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                {applyResults.map((r) => {
                  const label = guide.records.find((x) => x.key === r.key)?.label ?? r.key;
                  const meta = APPLY_META[r.status];
                  return (
                    <div key={r.key} style={{ display: "flex", gap: "8px", wordBreak: "break-all" }}>
                      <span style={{ flexShrink: 0, width: "64px", fontWeight: 500, color: meta.color }}>
                        {meta.text}
                      </span>
                      <span>
                        {label}：{r.message}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </form>

          <div style={{ fontSize: "12px", color: "var(--color-text-tertiary)", margin: "0 0 0.5rem" }}>
            或者手动到解析控制台逐条添加：
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            {guide.records.map((r) => {
              const c = checkOf(r.key);
              return (
                <div
                  key={r.key}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.8rem 1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "14px", fontWeight: 600 }}>{r.label}</span>
                    {checking && !c ? (
                      <Loader2 size={14} className="spin" style={{ color: "var(--color-text-tertiary)" }} />
                    ) : (
                      <StatusBadge status={c?.status ?? "pending"} optional={!r.required} />
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <CopyField label="主机记录" value={r.host} onCopied={copied} />
                    <CopyField label="记录类型" value={r.type} onCopied={copied} />
                    {r.priority !== undefined && (
                      <CopyField label="优先级" value={String(r.priority)} onCopied={copied} />
                    )}
                    <CopyField label="记录值" value={r.value} mono onCopied={copied} />
                  </div>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-tertiary)",
                      margin: "0.5rem 0 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {r.description}
                  </p>
                  {c && c.status !== "ok" && !(c.status === "missing" && !r.required) && (
                    <div
                      style={{
                        fontSize: "12px",
                        marginTop: "0.4rem",
                        color: STATUS_META[c.status].color,
                        lineHeight: 1.5,
                        wordBreak: "break-all",
                      }}
                    >
                      {c.message}
                      {c.found.length > 0 && <>；当前查到：{c.found.join(" | ")}</>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.5rem",
              marginTop: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn--outline"
              onClick={async () => {
                await copyText(recordsAsText(guide.domain, guide.records));
                showToast({ kind: "success", text: "全部解析记录已复制到剪贴板" });
              }}
            >
              <Copy size={14} style={{ marginRight: "4px" }} />
              复制全部记录
            </button>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn btn--outline" onClick={closeGuide}>
                关闭
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={checking}
                onClick={() => void runCheck(guide.domain)}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
              >
                {checking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                {checking ? "检测中..." : "检测解析"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 弹窗：移除域名确认 */}
      {deleteTarget && (
        <Modal width={420}>
          <div style={{ display: "flex", gap: "0.8rem", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 0.3rem 0" }}>确认移除此域名？</h3>
              <p
                style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}
              >
                将停止 <strong>{deleteTarget}</strong> 的收信路由与 DKIM
                签名。域名下还有邮箱时无法移除，请先删除这些邮箱。DKIM 密钥文件会保留，重新添加时继续使用。
              </p>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
            >
              取消
            </button>
            <button
              type="button"
              className={`btn btn--danger${busy ? " btn--loading" : ""}`}
              onClick={handleDelete}
              disabled={busy}
              aria-busy={busy}
              aria-label={busy ? "正在移除" : undefined}
            >
              <span className="btn__label">确认移除</span>
              {busy && <Spinner />}
            </button>
          </div>
        </Modal>
      )}
    </SettingsPanel>
  );
}
