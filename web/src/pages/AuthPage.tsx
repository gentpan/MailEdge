import { useState } from "react";
import { Mails } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../i18n";
import LanguageToggle from "../components/LanguageToggle";

interface Props {
  mode: "login" | "setup";
  onAuthenticated: () => Promise<void>;
}

export default function AuthPage({ mode, onAuthenticated }: Props) {
  const { t } = useI18n();
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
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <div className="auth__brand">
          <Mails size={20} />
          <span>{t("app.name")}</span>
          <span style={{ marginLeft: "auto" }}>
            <LanguageToggle />
          </span>
        </div>
        <h1 className="auth__title">{isSetup ? t("auth.setup.title") : t("auth.login.title")}</h1>
        <p className="auth__subtitle">{isSetup ? t("auth.setup.subtitle") : t("auth.login.subtitle")}</p>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="field">
          <label className="field__label" htmlFor="email">
            {t("auth.email")}
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
                {t("auth.name")}
              </label>
              <input
                id="name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("auth.name.optional")}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="mailbox">
                {t("auth.mailbox")}
              </label>
              <input
                id="mailbox"
                className="input"
                value={mailbox}
                onChange={(event) => setMailbox(event.target.value)}
                placeholder={email || "you@yourdomain.com"}
              />
              <span className="field__hint">{t("auth.mailbox.hint")}</span>
            </div>
          </>
        )}

        <div className="field">
          <label className="field__label" htmlFor="password">
            {t("auth.password")}
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
          {isSetup && <span className="field__hint">{t("auth.password.min")}</span>}
        </div>

        <button className="btn btn--block" type="submit" disabled={busy}>
          {busy ? t("auth.busy") : isSetup ? t("auth.submit.setup") : t("auth.submit.login")}
        </button>
      </form>
    </div>
  );
}
