import type { AuthenticationJSON, RegistrationJSON } from "@passwordless-id/webauthn";
import { server } from "@passwordless-id/webauthn";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { createMailbox, listMailboxes } from "../db/mailboxes";
import {
  consumeAuthChallenge,
  createAuthChallenge,
  createPasskeyCredential,
  getAuthChallenge,
  getPasskeyCredential,
  listPasskeyCredentials,
  updatePasskeyCounter,
} from "../db/passkeys";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  getPasswordResetToken,
} from "../db/password-reset";
import { getSendChain } from "../db/providers";
import {
  authenticate,
  changePassword,
  countUsers,
  createSession,
  createUser,
  destroySession,
  getUser,
  getUserByEmail,
  resolveSession,
} from "../db/users";
import { sha256Hex } from "../lib/crypto";
import { newMessageId, randomToken } from "../lib/id";
import { createMailProvider } from "../mail/factory";
import type { AppContext } from "./context";
import { clearCookie, readCookie, SESSION_COOKIE, sessionCookie } from "./context";

export const requireAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const token = readCookie(c.req.header("Cookie"), SESSION_COOKIE);
  if (!token) return c.json({ error: "未登录" }, 401);

  const user = await resolveSession(c.env, token);
  if (!user) return c.json({ error: "会话已失效，请重新登录" }, 401);

  c.set("user", user);
  c.set("sessionToken", token);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  if (c.get("user").role !== "admin") return c.json({ error: "需要管理员权限" }, 403);
  await next();
};

const auth = new Hono<AppContext>();

/** 首次部署时创建管理员；已有用户后该接口自动关闭 */
auth.get("/setup", async (c) => {
  return c.json({ needsSetup: (await countUsers(c.env)) === 0 });
});

auth.post("/setup", async (c) => {
  if ((await countUsers(c.env)) > 0) return c.json({ error: "系统已初始化" }, 409);

  const body = await c.req.json<{ email: string; password: string; name?: string; mailbox?: string }>();
  if (!body.email || !body.password) return c.json({ error: "邮箱和密码不能为空" }, 400);
  if (body.password.length < 8) return c.json({ error: "密码至少 8 位" }, 400);

  const user = await createUser(c.env, {
    email: body.email,
    password: body.password,
    name: body.name,
    role: "admin",
  });

  const address = (body.mailbox ?? body.email).trim().toLowerCase();
  if (address.includes("@")) {
    await createMailbox(c.env, { address, userId: user.id, displayName: body.name, isCatchAll: true });
  }

  const { token, expiresAt } = await createSession(c.env, user.id);
  c.header("Set-Cookie", sessionCookie(token, expiresAt, isSecure(c.req.url)));
  return c.json({ user });
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const user = await authenticate(c.env, body.email ?? "", body.password ?? "");
  if (!user) return c.json({ error: "邮箱或密码不正确" }, 401);

  const { token, expiresAt } = await createSession(c.env, user.id);
  c.header("Set-Cookie", sessionCookie(token, expiresAt, isSecure(c.req.url)));
  return c.json({ user });
});

/** Passkey 注册：挑战只在 D1 保存 5 分钟，私钥不会上传到 Worker。 */
auth.post("/passkey/register/options", requireAuth, async (c) => {
  const user = c.get("user");
  const challenge = server.randomChallenge();
  await createAuthChallenge(c.env, {
    kind: "register",
    userId: user.id,
    challenge,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  return c.json({
    challenge,
    domain: rpId(c.req.url),
    user: { id: user.id, name: user.email, displayName: user.name || user.email },
    credentials: (await listPasskeyCredentials(c.env, user.id)).map((item) => ({
      id: item.id,
      transports: item.transports,
    })),
  });
});

auth.post("/passkey/register/verify", requireAuth, async (c) => {
  const body = await c.req.json<{ challenge: string; registration: RegistrationJSON }>();
  const user = c.get("user");
  const pending = await getAuthChallenge(c.env, {
    kind: "register",
    challenge: body.challenge,
    userId: user.id,
  });
  if (!pending) return c.json({ error: "Passkey 注册挑战已过期，请重试" }, 400);

  try {
    const result = await server.verifyRegistration(body.registration, {
      challenge: pending.challenge,
      origin: authOrigin(c.req.url),
      domain: rpId(c.req.url),
      userVerified: true,
    });
    if (result.userVerified === false || result.user.id !== user.id) {
      return c.json({ error: "Passkey 用户验证失败" }, 400);
    }
    const consumed = await consumeAuthChallenge(c.env, pending.id);
    if (!consumed) return c.json({ error: "Passkey 注册挑战已使用，请重试" }, 400);

    await createPasskeyCredential(c.env, {
      id: result.credential.id,
      userId: user.id,
      publicKey: result.credential.publicKey,
      algorithm: result.credential.algorithm,
      transports: result.credential.transports,
      counter: result.authenticator.counter,
    });
    return c.json({ ok: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Passkey 注册失败" }, 400);
  }
});

/** 登录页先输入邮箱，再让浏览器选择该账户已登记的 Passkey。 */
auth.post("/passkey/login/options", async (c) => {
  const body = await c.req.json<{ email: string }>();
  const user = await getUserByEmail(c.env, body.email ?? "");
  const credentials = user ? await listPasskeyCredentials(c.env, user.id) : [];
  if (!user || !credentials.length || !user.isEnabled) {
    return c.json({ error: "未找到可用的 Passkey，请先使用密码登录并在账户设置中添加" }, 404);
  }

  const challenge = server.randomChallenge();
  await createAuthChallenge(c.env, {
    kind: "login",
    userId: user.id,
    challenge,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  return c.json({
    challenge,
    domain: rpId(c.req.url),
    allowCredentials: credentials.map((item) => ({ id: item.id, transports: item.transports })),
  });
});

auth.post("/passkey/login/verify", async (c) => {
  const body = await c.req.json<{ challenge: string; authentication: AuthenticationJSON }>();
  const credential = await getPasskeyCredential(c.env, body.authentication?.id ?? "");
  if (!credential) return c.json({ error: "Passkey 不存在，请改用密码登录" }, 401);
  const pending = await getAuthChallenge(c.env, {
    kind: "login",
    challenge: body.challenge,
    userId: credential.userId,
  });
  if (!pending) return c.json({ error: "Passkey 登录挑战已过期，请重试" }, 400);

  try {
    const result = await server.verifyAuthentication(body.authentication, credential, {
      challenge: pending.challenge,
      origin: authOrigin(c.req.url),
      domain: rpId(c.req.url),
      userVerified: true,
      counter: credential.counter,
    });
    if (!result.userVerified) return c.json({ error: "Passkey 用户验证失败" }, 401);
    const consumed = await consumeAuthChallenge(c.env, pending.id);
    if (!consumed) return c.json({ error: "Passkey 登录挑战已使用，请重试" }, 400);

    const user = await getUser(c.env, credential.userId);
    if (!user?.isEnabled) return c.json({ error: "用户不存在或已停用" }, 401);
    await updatePasskeyCounter(c.env, credential.id, result.counter);
    const { token, expiresAt } = await createSession(c.env, credential.userId);
    c.header("Set-Cookie", sessionCookie(token, expiresAt, isSecure(c.req.url)));
    return c.json({ user });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Passkey 登录失败" }, 401);
  }
});

/** 找回密码只返回统一结果，避免通过接口枚举账户是否存在。 */
auth.post("/password-reset/request", async (c) => {
  const body = await c.req.json<{ email: string }>();
  const user = await getUserByEmail(c.env, body.email ?? "");
  if (!user?.isEnabled) return c.json({ ok: true });

  try {
    const chain = await getSendChain(c.env);
    const mailbox = (await listMailboxes(c.env, user.id))[0];
    if (!chain.length || !mailbox) return c.json({ ok: true });

    const token = randomToken(32);
    await createPasswordResetToken(c.env, {
      userId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    });

    // 使用 fragment，令牌不会随页面请求进入 Worker 日志或 Referer。
    const link = `${publicAppUrl(c.env, c.req.url)}/#reset=${encodeURIComponent(token)}`;
    let delivered = false;
    for (const providerRecord of chain) {
      const provider = createMailProvider(c.env, providerRecord.config, newMessageId());
      const result = await provider.send({
        from: { email: mailbox.address, name: "MailEdge" },
        to: [{ email: user.email }],
        subject: "MailEdge 密码重置",
        text: `我们收到了密码重置请求。请在 30 分钟内打开以下链接设置新密码：\n\n${link}\n\n如果不是你本人操作，请忽略此邮件。`,
        html: `<p>我们收到了密码重置请求。</p><p><a href="${link}">设置新的 MailEdge 密码</a></p><p>链接 30 分钟内有效。如果不是你本人操作，请忽略此邮件。</p>`,
      });
      if (result.success) {
        delivered = true;
        break;
      }
    }
    if (!delivered) console.error("[MailEdge] password reset delivery failed on all providers");
  } catch (error) {
    console.error("[MailEdge] password reset delivery failed", error);
  }
  return c.json({ ok: true });
});

auth.post("/password-reset/confirm", async (c) => {
  const body = await c.req.json<{ token: string; newPassword: string }>();
  if (!body.token || !body.newPassword || body.newPassword.length < 8) {
    return c.json({ error: "重置链接无效或新密码至少需要 8 位" }, 400);
  }
  const record = await getPasswordResetToken(c.env, await sha256Hex(body.token));
  if (!record || !(await consumePasswordResetToken(c.env, record.id))) {
    return c.json({ error: "重置链接无效或已过期，请重新申请" }, 400);
  }
  await changePassword(c.env, record.userId, body.newPassword);
  return c.json({ ok: true });
});

auth.post("/logout", requireAuth, async (c) => {
  await destroySession(c.env, c.get("sessionToken"));
  c.header("Set-Cookie", clearCookie(isSecure(c.req.url)));
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user, mailboxes: await listMailboxes(c.env, user.id) });
});

auth.post("/password", requireAuth, async (c) => {
  const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
  const user = c.get("user");

  if (!(await authenticate(c.env, user.email, body.currentPassword ?? ""))) {
    return c.json({ error: "当前密码不正确" }, 400);
  }
  if (!body.newPassword || body.newPassword.length < 8) return c.json({ error: "新密码至少 8 位" }, 400);

  await changePassword(c.env, user.id, body.newPassword);
  c.header("Set-Cookie", clearCookie(isSecure(c.req.url)));
  return c.json({ ok: true });
});

function isSecure(url: string): boolean {
  return new URL(url).protocol === "https:";
}

function authOrigin(url: string): string {
  return new URL(url).origin;
}

function rpId(url: string): string {
  return new URL(url).hostname;
}

function publicAppUrl(env: AppContext["Bindings"], requestUrl: string): string {
  const configured = env.APP_URL?.trim();
  if (configured && !configured.includes("example.com")) return configured.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}

export default auth;
