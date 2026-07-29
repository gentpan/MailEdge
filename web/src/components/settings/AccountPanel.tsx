import { useState } from "react";
import { api } from "../../lib/api";
import type { User } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import FormRow from "./FormRow";

interface Props {
  user: User;
}

export default function AccountPanel({ user }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function update() {
    setBusy(true);
    setMessage(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setMessage({ kind: "success", text: "密码已更新，所有会话已失效，请重新登录" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "修改失败" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel">
      <header className="panel-head">
        <h1 className="panel-head__title">账户</h1>
        <p className="panel-head__desc">当前登录的账户信息与密码。</p>
      </header>

      <FormRow label="账户邮箱">
        <p className="text-sm">{user.email}</p>
      </FormRow>

      <FormRow label="显示名称">
        <p className="text-sm">{user.name || "未设置"}</p>
      </FormRow>

      <FormRow label="角色">
        <span className="badge">{user.role === "admin" ? "管理员" : "普通用户"}</span>
      </FormRow>

      <FormRow label="创建时间">
        <p className="text-sm text-secondary">{formatDateTime(user.createdAt)}</p>
      </FormRow>

      {message && <div className={`alert alert--${message.kind}`}>{message.text}</div>}

      <FormRow label="当前密码">
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormRow>

      <FormRow label="新密码" hint="至少 8 位，修改后需重新登录">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </FormRow>

      <div className="form-actions">
        <button
          className="btn"
          type="button"
          onClick={() => void update()}
          disabled={busy || !currentPassword || newPassword.length < 8}
        >
          {busy ? "处理中…" : "更新密码"}
        </button>
      </div>
    </div>
  );
}
