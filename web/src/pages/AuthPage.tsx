import { useState } from "react";
import { Mails } from "lucide-react";
import { api } from "../lib/api";

interface Props {
  mode: "login" | "setup";
  onAuthenticated: () => Promise<void>;
}

export default function AuthPage({ mode, onAuthenticated }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === "setup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (isSetup) {
        await api.setup({ email, password, name: name || undefined, mailbox: mailbox || email });
      } else {
        await api.login({ email, password });
      }
      await onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <div className="auth__brand">
          <Mails size={20} />
          <span>MailEdge</span>
        </div>
        <h1 className="auth__title">{isSetup ? "初始化系统" : "登录"}</h1>
        <p className="auth__subtitle">
          {isSetup ? "创建第一个管理员账户，并绑定一个收件地址。" : "使用你的 MailEdge 账户登录。"}
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="field">
          <label className="field__label" htmlFor="email">
            账户邮箱
          </label>
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            autoComplete="username"
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        {isSetup && (
          <>
            <div className="field">
              <label className="field__label" htmlFor="name">
                显示名称
              </label>
              <input
                id="name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="选填"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="mailbox">
                收件地址
              </label>
              <input
                id="mailbox"
                className="input"
                value={mailbox}
                onChange={(event) => setMailbox(event.target.value)}
                placeholder={email || "you@yourdomain.com"}
              />
              <span className="field__hint">
                该地址会被设为域名的兜底信箱，需在 Cloudflare Email Routing 中指向本 Worker。
              </span>
            </div>
          </>
        )}

        <div className="field">
          <label className="field__label" htmlFor="password">
            密码
          </label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            autoComplete={isSetup ? "new-password" : "current-password"}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {isSetup && <span className="field__hint">至少 8 位</span>}
        </div>

        <button className="btn btn--block" type="submit" disabled={busy}>
          {busy ? "处理中…" : isSetup ? "创建管理员" : "登录"}
        </button>
      </form>
    </div>
  );
}
