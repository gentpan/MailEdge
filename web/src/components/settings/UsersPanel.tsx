import { useEffect, useState } from "react";
import { useSession } from "../../App";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from "../icons";
import { api } from "../../lib/api";
import Spinner from "../Spinner";
import UserAvatar from "../UserAvatar";
import FormRow from "./FormRow";
import ProfileEditor from "./ProfileEditor";
import SettingsPanel from "./SettingsPanel";
import { useSettingsToast } from "./SettingsToast";

export interface ManagedUser {
  email: string;
  username: string;
  domain: string;
  size: string;
  /** 发信昵称与头像（本库里的资料；没设置过为 null） */
  name?: string | null;
  avatarUrl?: string | null;
}

export default function UsersPanel() {
  const { user, refresh } = useSession();
  const { showToast, dismissToast } = useSettingsToast();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmailUser, setNewEmailUser] = useState("");
  const [newEmailDomain, setNewEmailDomain] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createdResult, setCreatedResult] = useState<{ email: string; pass: string } | null>(null);

  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);
  const [profileUser, setProfileUser] = useState<ManagedUser | null>(null);
  const [domainOptions, setDomainOptions] = useState<string[]>([]);

  // 载入用户列表
  async function loadUsers(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "获取用户列表失败");
      const list: ManagedUser[] = data.users || [];
      setUsers(list);
      setProfileUser((current) => (current ? (list.find((u) => u.email === current.email) ?? null) : null));
      if (!newEmailDomain && data.callerDomain) {
        setNewEmailDomain(data.callerDomain);
      }
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "加载失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // 域名下拉候选：取不到（比如非独立版）就退回手填
    fetch("/api/admin/domains", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.domains && setDomainOptions(d.domains.map((x: { domain: string }) => x.domain)))
      .catch(() => {});
  }, []);

  function generateRandomPassword() {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 16; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  // 添加用户
  async function handleAddUser(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const username = newEmailUser.trim().toLowerCase();
    const domain = (newEmailDomain.trim() || user.email.split("@")[1] || "").toLowerCase();
    if (!username || !domain) {
      showToast({ kind: "error", text: "请输入完整的邮箱账号与域名" });
      return;
    }
    const fullEmail = `${username}@${domain}`;
    const password = newPassword.trim() || generateRandomPassword();

    setBusy(true);
    dismissToast();
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: fullEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建邮箱失败");

      setCreatedResult({ email: fullEmail, pass: password });
      setNewEmailUser("");
      setNewPassword("");
      setShowAddModal(false);
      showToast({ kind: "success", text: `邮箱 [${fullEmail}] 创建成功！` });
      loadUsers();
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "创建失败" });
    } finally {
      setBusy(false);
    }
  }

  /** 资料改动后刷新列表；改的是自己时，侧边栏的头像和昵称也要跟着变 */
  async function afterProfileChange(email: string) {
    await loadUsers(true);
    if (email.toLowerCase() === user.email.toLowerCase()) await refresh();
  }

  // 重置密码
  async function handleResetPassword(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!resetUser) return;
    const pwd = resetPassword.trim();
    if (!pwd || pwd.length < 6) {
      showToast({ kind: "error", text: "密码长度不能少于 6 位" });
      return;
    }

    setBusy(true);
    dismissToast();
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(resetUser.email)}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重置密码失败");

      showToast({ kind: "success", text: `用户 [${resetUser.email}] 密码已强制重置成功！` });
      setResetUser(null);
      setResetPassword("");
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "重置失败" });
    } finally {
      setBusy(false);
    }
  }

  // 删除用户
  async function handleDeleteUser() {
    if (!deleteUser) return;
    setBusy(true);
    dismissToast();
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(deleteUser.email)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");

      showToast({ kind: "success", text: `用户 [${deleteUser.email}] 已彻底删除` });
      setDeleteUser(null);
      loadUsers();
    } catch (err: any) {
      showToast({ kind: "error", text: err.message || "删除失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPanel
      title="邮箱与用户管理"
      description="集中管理各域名的邮箱账户。可分配子邮箱给用户/员工使用（支持 IMAP/SMTP 客户端与 Webmail 直连），并随时重置密码或注销账户。"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Users size={18} style={{ color: "var(--color-primary)" }} />
          <span style={{ fontSize: "14px", fontWeight: 500 }}>当前账户列表（共 {users.length} 个）</span>
        </div>
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
          onClick={() => {
            setNewPassword(generateRandomPassword());
            setShowAddModal(true);
          }}
        >
          <Plus size={15} />
          新建邮箱账户
        </button>
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
      ) : users.length === 0 ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--color-text-tertiary)",
            fontSize: "13px",
          }}
        >
          暂无已配置的邮箱账户
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
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
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>邮箱地址</th>
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>所属域名</th>
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>空间占用</th>
                <th style={{ padding: "10px 14px", fontWeight: 500 }}>权限角色</th>
                <th style={{ padding: "10px 14px", fontWeight: 500, textAlign: "right" }}>管理操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdmin = u.username === "admin" || u.username === "postmaster";
                const isCurrent = u.email.toLowerCase() === user.email.toLowerCase();

                return (
                  <tr
                    key={u.email}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 500 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <UserAvatar label={u.name || u.username} avatarUrl={u.avatarUrl} className="users-row__avatar" size={26} />
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                          {u.name && <span>{u.name}</span>}
                          <span style={u.name ? { fontSize: "12px", fontWeight: 400, color: "var(--color-text-secondary)" } : undefined}>
                            {u.email}
                          </span>
                        </span>
                        {isCurrent && (
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "1px 6px",
                              borderRadius: "10px",
                              background: "var(--color-neutral-200)",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            当前登录
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", color: "var(--color-text-secondary)" }}>{u.domain}</td>
                    <td style={{ padding: "10px 14px", color: "var(--color-text-secondary)" }}>
                      {u.size || "0 KB"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {isAdmin ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "11px",
                            padding: "2px 7px",
                            borderRadius: "12px",
                            background: "rgba(59, 130, 246, 0.12)",
                            color: "#2563eb",
                            fontWeight: 500,
                          }}
                        >
                          <Shield size={11} />
                          管理员
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "11px",
                            padding: "2px 7px",
                            borderRadius: "12px",
                            background: "rgba(16, 185, 129, 0.12)",
                            color: "#059669",
                            fontWeight: 500,
                          }}
                        >
                          <User size={11} />
                          普通邮箱
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn btn--outline"
                          style={{ padding: "3px 8px", fontSize: "12px" }}
                          onClick={() => setProfileUser(u)}
                        >
                          <Pencil size={12} style={{ marginRight: "3px" }} />
                          编辑资料
                        </button>
                        <button
                          type="button"
                          className="btn btn--outline"
                          style={{ padding: "3px 8px", fontSize: "12px" }}
                          onClick={() => {
                            setResetUser(u);
                            setResetPassword(generateRandomPassword());
                          }}
                        >
                          <KeyRound size={12} style={{ marginRight: "3px" }} />
                          重置密码
                        </button>
                        {!isCurrent && (
                          <button
                            type="button"
                            className="btn btn--danger"
                            style={{ padding: "3px 8px", fontSize: "12px" }}
                            onClick={() => setDeleteUser(u)}
                          >
                            <Trash2 size={12} style={{ marginRight: "3px" }} />
                            删除
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

      {/* 弹窗：创建新邮箱 */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "var(--color-bg)",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "440px",
              maxWidth: "90vw",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>创建新邮箱账户</h3>
              <button
                type="button"
                className="btn btn--outline"
                style={{ padding: "4px", borderRadius: "50%" }}
                onClick={() => setShowAddModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddUser}>
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  邮箱地址
                </label>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="例如: tom"
                    required
                    style={{ flex: 1 }}
                    value={newEmailUser}
                    onChange={(e) => setNewEmailUser(e.target.value)}
                  />
                  <span style={{ fontWeight: 600 }}>@</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="域名"
                    required
                    list="users-panel-domains"
                    style={{ width: "160px" }}
                    value={newEmailDomain}
                    onChange={(e) => setNewEmailDomain(e.target.value)}
                  />
                  <datalist id="users-panel-domains">
                    {domainOptions.map((d) => (
                      <option key={d} value={d} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div style={{ marginBottom: "1.2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>初始密码</label>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                    onClick={() => setNewPassword(generateRandomPassword())}
                  >
                    🎲 换一个随机强密码
                  </button>
                </div>
                <input
                  type="text"
                  className="input"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setShowAddModal(false)}
                  disabled={busy}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`btn btn--primary${busy ? " btn--loading" : ""}`}
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={busy ? "正在创建" : undefined}
                >
                  <span className="btn__label">确认创建</span>
                  {busy && <Spinner />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗：重置密码 */}
      {resetUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "var(--color-bg)",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "420px",
              maxWidth: "90vw",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>强制重置密码</h3>
              <button
                type="button"
                className="btn btn--outline"
                style={{ padding: "4px", borderRadius: "50%" }}
                onClick={() => setResetUser(null)}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              正在为账户 <strong>{resetUser.email}</strong> 设置新密码：
            </p>

            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: "1.2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <label style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>新密码</label>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-primary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                    onClick={() => setResetPassword(generateRandomPassword())}
                  >
                    🎲 随机生成密码
                  </button>
                </div>
                <input
                  type="text"
                  className="input"
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => setResetUser(null)}
                  disabled={busy}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`btn btn--primary${busy ? " btn--loading" : ""}`}
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={busy ? "正在保存" : undefined}
                >
                  <span className="btn__label">确认重置</span>
                  {busy && <Spinner />}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗：编辑资料（发信昵称、头像） */}
      {profileUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "var(--color-bg)",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "480px",
              maxWidth: "92vw",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>编辑资料</h3>
                <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "0.2rem 0 0" }}>
                  {profileUser.email}
                </p>
              </div>
              <button
                type="button"
                className="btn btn--outline"
                style={{ padding: "4px", borderRadius: "50%" }}
                aria-label="关闭"
                onClick={() => setProfileUser(null)}
              >
                <X size={16} />
              </button>
            </div>
            <ProfileEditor
              email={profileUser.email}
              name={profileUser.name ?? null}
              avatarUrl={profileUser.avatarUrl ?? null}
              onSaveName={async (name) => {
                await api.adminUpdateUserProfile(profileUser.email, { name });
                await afterProfileChange(profileUser.email);
                showToast({ kind: "success", text: "资料已保存" });
              }}
              onUploadAvatar={async (image) => {
                await api.adminUploadUserAvatar(profileUser.email, image);
                await afterProfileChange(profileUser.email);
              }}
              onDeleteAvatar={async () => {
                await api.adminDeleteUserAvatar(profileUser.email);
                await afterProfileChange(profileUser.email);
              }}
              onError={(text) => showToast({ kind: "error", text })}
            />
          </div>
        </div>
      )}

      {/* 弹窗：删除确认 */}
      {deleteUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "var(--color-bg)",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "420px",
              maxWidth: "90vw",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
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
                <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 0.3rem 0" }}>
                  确认删除此邮箱账户？
                </h3>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  即将删除 <strong>{deleteUser.email}</strong>
                  。此操作将同时彻底清空该邮箱在磁盘上的所有邮件与文件夹，操作不可撤销！
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => setDeleteUser(null)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="button"
                className={`btn btn--danger${busy ? " btn--loading" : ""}`}
                onClick={handleDeleteUser}
                disabled={busy}
                aria-busy={busy}
                aria-label={busy ? "正在删除" : undefined}
              >
                <span className="btn__label">确认彻底删除</span>
                {busy && <Spinner />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗：创建成功后的凭据卡片 */}
      {createdResult && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              background: "var(--color-bg)",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              width: "460px",
              maxWidth: "90vw",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "1rem" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <Check size={26} />
              </div>
              <h3 style={{ fontSize: "17px", fontWeight: 600, margin: 0 }}>邮箱账户创建成功</h3>
              <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                请妥善保存此账户凭据并发送给使用者：
              </p>
            </div>

            <div
              style={{
                background: "var(--color-neutral-50)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                fontSize: "13px",
                lineHeight: "1.8",
                marginBottom: "1rem",
              }}
            >
              <div>
                <strong>邮箱地址：</strong>
                <code>{createdResult.email}</code>
              </div>
              <div>
                <strong>登录密码：</strong>
                <code>{createdResult.pass}</code>
              </div>
              <div>
                <strong>Web 登录：</strong>
                <code>https://mail.{createdResult.email.split("@")[1]}</code>
              </div>
              <div>
                <strong>IMAP (收件)：</strong>
                <code>mx.giantaccel.com : 993 (SSL)</code>
              </div>
              <div>
                <strong>SMTP (发件)：</strong>
                <code>mx.giantaccel.com : 587 (STARTTLS) / 465</code>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => {
                  const text = `邮箱账户：${createdResult.email}\n登录密码：${createdResult.pass}\n网页端：https://mail.${createdResult.email.split("@")[1]}\nIMAP收件：mx.giantaccel.com:993 (SSL)\nSMTP发件：mx.giantaccel.com:587 (STARTTLS)`;
                  navigator.clipboard.writeText(text);
                  showToast({ kind: "success", text: "账户配置已复制到剪贴板！" });
                }}
              >
                <Copy size={14} style={{ marginRight: "4px" }} />
                复制全部信息
              </button>
              <button type="button" className="btn btn--primary" onClick={() => setCreatedResult(null)}>
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
