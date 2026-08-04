import { client } from "@passwordless-id/webauthn";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import LanguageToggle from "../components/LanguageToggle";
import Logo from "../components/Logo";
import { useI18n } from "../i18n";
import { api } from "../lib/api";

interface Props {
  mode: "login" | "setup";
  onAuthenticated: () => Promise<void>;
}

type AuthView = "login" | "forgot" | "reset";

export default function AuthPage({ mode, onAuthenticated }: Props) {
  const { t } = useI18n();
  const resetToken =
    mode === "login"
      ? new URLSearchParams(window.location.search).get("reset") ||
        new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reset") ||
        ""
      : "";
  const [view, setView] = useState<AuthView>(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordAgain, setResetPasswordAgain] = useState("");
  const [name, setName] = useState("");
  const [mailbox, setMailbox] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const isSetup = mode === "setup";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (view === "forgot") {
        await api.requestPasswordReset({ email });
        setNotice(t("auth.forgot.sent"));
        return;
      }
      if (view === "reset") {
        if (resetPassword !== resetPasswordAgain) throw new Error(t("auth.reset.mismatch"));
        await api.confirmPasswordReset({ token: resetToken, newPassword: resetPassword });
        window.history.replaceState({}, "", window.location.pathname);
        setView("login");
        setPassword("");
        setNotice(t("auth.reset.success"));
        return;
      }
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

  async function loginWithPasskey() {
    setPasskeyBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!client.isAvailable()) throw new Error(t("auth.passkey.unavailable"));
      if (!email.trim()) throw new Error(t("auth.passkey.emailRequired"));
      const options = await api.passkeyLoginOptions({ email });
      const authentication = await client.authenticate({
        challenge: options.challenge,
        domain: options.domain,
        allowCredentials: options.allowCredentials,
        userVerification: "required",
      });
      await api.passkeyLoginVerify({ challenge: options.challenge, authentication });
      await onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("auth.passkey.failed"));
    } finally {
      setPasskeyBusy(false);
    }
  }

  const title = isSetup
    ? t("auth.setup.title")
    : view === "forgot"
      ? t("auth.forgot.title")
      : view === "reset"
        ? t("auth.reset.title")
        : t("auth.login.title");
  const subtitle = isSetup
    ? t("auth.setup.subtitle")
    : view === "forgot"
      ? t("auth.forgot.subtitle")
      : view === "reset"
        ? t("auth.reset.subtitle")
        : "";

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <div className="auth__brand">
          <Logo size={20} />
          <span className="auth__brand-name">{t("app.name")}</span>
          {!isSetup && view === "login" && (
            <>
              <span className="auth__brand-divider" aria-hidden="true">
                ·
              </span>
              <span className="auth__brand-context">{t("auth.login.title")}</span>
            </>
          )}
          <span style={{ marginLeft: "auto" }}>
            <LanguageToggle />
          </span>
        </div>
        {isSetup || view !== "login" ? <h1 className="auth__title">{title}</h1> : null}
        {subtitle ? <p className="auth__subtitle">{subtitle}</p> : null}

        {error && <div className="alert alert--error">{error}</div>}
        {notice && <div className="alert alert--success">{notice}</div>}

        {view === "forgot" ? (
          <>
            <AuthEmailField email={email} setEmail={setEmail} label={t("auth.email")} />
            <button className="btn btn--block" type="submit" disabled={busy || !email.trim()}>
              {busy ? t("auth.busy") : t("auth.forgot.submit")}
            </button>
            <button className="btn btn--ghost btn--block" type="button" onClick={() => setView("login")}>
              {t("auth.forgot.back")}
            </button>
          </>
        ) : view === "reset" ? (
          <>
            <div className="field">
              <label className="field__label" htmlFor="reset-password">
                {t("auth.reset.password")}
              </label>
              <input
                id="reset-password"
                className="input"
                type="password"
                value={resetPassword}
                autoComplete="new-password"
                onChange={(event) => setResetPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="reset-password-again">
                {t("auth.reset.passwordAgain")}
              </label>
              <input
                id="reset-password-again"
                className="input"
                type="password"
                value={resetPasswordAgain}
                autoComplete="new-password"
                onChange={(event) => setResetPasswordAgain(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <button className="btn btn--block" type="submit" disabled={busy || resetPassword.length < 8}>
              {busy ? t("auth.busy") : t("auth.reset.submit")}
            </button>
          </>
        ) : (
          <>
            <AuthEmailField email={email} setEmail={setEmail} label={t("auth.email")} />

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

            {!isSetup && (
              <>
                <button
                  className="btn btn--secondary btn--block auth__passkey"
                  type="button"
                  onClick={() => void loginWithPasskey()}
                  disabled={busy || passkeyBusy || !email.trim()}
                >
                  <KeyRound size={16} aria-hidden="true" />
                  {passkeyBusy ? t("auth.passkey.busy") : t("auth.passkey")}
                </button>
                <div className="auth__links">
                  <button className="link-button" type="button" onClick={() => setView("forgot")}>
                    {t("auth.forgot")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </form>
    </div>
  );
}

function AuthEmailField({
  email,
  setEmail,
  label,
}: {
  email: string;
  setEmail: (value: string) => void;
  label: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="email">
        {label}
      </label>
      <input
        id="email"
        className="input"
        type="email"
        value={email}
        autoComplete="username webauthn"
        onChange={(event) => setEmail(event.target.value)}
        required
      />
    </div>
  );
}
