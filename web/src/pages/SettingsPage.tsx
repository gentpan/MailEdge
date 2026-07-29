import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import { useSession } from "../App";
import ProviderCard from "../components/ProviderCard";
import { api } from "../lib/api";
import type { Mailbox, OutboundView, ProviderView } from "../lib/api";
import type { MailProviderType } from "../../../src/mail/types";
import { PROVIDER_LABELS, STATUS_LABELS, formatDateTime, formatSize } from "../lib/format";

const PROVIDER_TYPES: MailProviderType[] = ["cloudflare", "sendflare", "resend"];

export default function SettingsPage() {
  const { user, refresh } = useSession();
  const isAdmin = user.role === "admin";

  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [outbox, setOutbox] = useState<OutboundView[]>([]);
  const [shares, setShares] = useState<Awaited<ReturnType<typeof api.shares>>["shares"]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const [newAddress, setNewAddress] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    const [providerResult, mailboxResult, outboxResult, shareResult] = await Promise.all([
      api.providers(),
      api.mailboxes(),
      api.outbox(),
      api.shares(),
    ]);
    setProviders(providerResult.providers);
    setMailboxes(mailboxResult.mailboxes);
    setOutbox(outboxResult.messages);
    setShares(shareResult.shares);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMailbox() {
    try {
      await api.createMailbox({ address: newAddress });
      setNewAddress("");
      setNotice("信箱已添加，请确认 Cloudflare Email Routing 已把该地址指向本 Worker");
      await load();
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "添加失败");
    }
  }

  async function retry(id: string) {
    try {
      await api.retry(id);
      setNotice("已重新投递");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重试失败");
    }
  }

  async function updatePassword() {
    try {
      await api.changePassword({ currentPassword, newPassword });
      setNotice("密码已更新，请重新登录");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "修改失败");
    }
  }

  return (
    <div className="settings">
      <div className="settings__inner">
        <header className="settings__header">
          <Link className="btn btn--icon" to="/" aria-label="返回">
            <ArrowLeft size={16} />
          </Link>
          <h1>设置</h1>
          <div className="settings__header-spacer" />
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => void load()}>
            <RefreshCw size={14} />
            刷新
          </button>
        </header>

        {notice && <div className="alert alert--success">{notice}</div>}

        {isAdmin && (
          <section className="settings__section">
            <h2 className="settings__section-title">发信服务</h2>
            <p className="settings__section-desc">
              默认渠道优先使用；只有网络故障、429、5xx 这类临时错误才会自动切换到备用渠道。
              域名未验证、地址非法、内容被拒等永久性错误不会重发，避免同一封邮件在多个平台各发一次。
            </p>

            {PROVIDER_TYPES.map((type) => (
              <ProviderCard
                key={type}
                type={type}
                provider={providers.find((item) => item.type === type)}
                mailboxes={mailboxes}
                onChanged={() => void load()}
              />
            ))}
          </section>
        )}

        <section className="settings__section">
          <h2 className="settings__section-title">收件地址</h2>
          <p className="settings__section-desc">
            收件依赖 Cloudflare Email Routing：在域名的 Email Routing 中把地址（或 catch-all）投递到本 Worker。
          </p>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>地址</th>
                  <th>类型</th>
                  <th>创建时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mailboxes.map((mailbox) => (
                  <tr key={mailbox.id}>
                    <td>{mailbox.address}</td>
                    <td>{mailbox.isCatchAll ? <span className="badge">兜底信箱</span> : "普通"}</td>
                    <td className="text-tertiary text-xs">{formatDateTime(mailbox.createdAt)}</td>
                    <td>
                      <button
                        className="btn btn--icon"
                        type="button"
                        aria-label="删除"
                        onClick={async () => {
                          await api.deleteMailbox(mailbox.id);
                          await load();
                          await refresh();
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="row row--wrap">
              <input
                className="input"
                value={newAddress}
                placeholder="you@yourdomain.com"
                onChange={(event) => setNewAddress(event.target.value)}
              />
              <button className="btn" type="button" onClick={() => void addMailbox()} disabled={!newAddress}>
                添加
              </button>
            </div>
          </div>
        </section>

        <section className="settings__section">
          <h2 className="settings__section-title">发信记录</h2>
          <p className="settings__section-desc">
            每封邮件有固定的内部 ID，切换渠道时沿用同一个，便于追踪与去重。
          </p>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>主题</th>
                  <th>收件人</th>
                  <th>状态</th>
                  <th>渠道</th>
                  <th>时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {outbox.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.subject}
                      <div className="mono text-tertiary">{item.id}</div>
                      {item.lastError && <div className="text-xs text-secondary">{item.lastError}</div>}
                    </td>
                    <td className="text-xs">{item.to.map((address) => address.email).join("、")}</td>
                    <td>
                      <span
                        className={`badge ${
                          item.status === "sent"
                            ? "badge--success"
                            : item.status === "failed"
                              ? "badge--error"
                              : "badge--warning"
                        }`}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {item.attempts > 1 && <span className="text-xs text-tertiary"> 第 {item.attempts} 次</span>}
                    </td>
                    <td className="text-xs">
                      {item.providerType ? (PROVIDER_LABELS[item.providerType] ?? item.providerType) : "—"}
                    </td>
                    <td className="text-xs text-tertiary">{formatDateTime(item.createdAt)}</td>
                    <td>
                      {item.status !== "sent" && (
                        <button className="btn btn--secondary btn--sm" type="button" onClick={() => void retry(item.id)}>
                          重试
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!outbox.length && (
                  <tr>
                    <td colSpan={6} className="text-tertiary">
                      暂无发信记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="settings__section">
          <h2 className="settings__section-title">附件下载链接</h2>
          <p className="settings__section-desc">
            超过阈值的附件会上传到 R2 并在正文中插入下载链接，可随时撤销或查看下载次数。
          </p>

          <div className="card">
            <table className="table">
              <thead>
                <tr>
                  <th>文件</th>
                  <th>大小</th>
                  <th>下载次数</th>
                  <th>过期时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shares.map((share) => (
                  <tr key={share.token}>
                    <td>
                      {share.filename}
                      {share.is_revoked === 1 && <span className="badge badge--error">已撤销</span>}
                    </td>
                    <td className="text-xs">{formatSize(share.size)}</td>
                    <td className="text-xs">{share.downloads}</td>
                    <td className="text-xs text-tertiary">
                      {share.expires_at ? formatDateTime(share.expires_at) : "永久"}
                    </td>
                    <td>
                      {share.is_revoked === 0 && (
                        <button
                          className="btn btn--secondary btn--sm"
                          type="button"
                          onClick={async () => {
                            await api.revokeShare(share.token);
                            await load();
                          }}
                        >
                          撤销
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!shares.length && (
                  <tr>
                    <td colSpan={5} className="text-tertiary">
                      暂无分享链接
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="settings__section">
          <h2 className="settings__section-title">账户</h2>
          <div className="card">
            <div className="field">
              <label className="field__label">当前密码</label>
              <input
                className="input"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">新密码</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <span className="field__hint">至少 8 位。修改后所有会话都会失效。</span>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => void updatePassword()}
              disabled={!currentPassword || newPassword.length < 8}
            >
              更新密码
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
