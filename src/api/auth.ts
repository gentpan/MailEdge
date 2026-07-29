import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { createMailbox, listMailboxes } from "../db/mailboxes";
import {
  authenticate,
  changePassword,
  countUsers,
  createSession,
  createUser,
  destroySession,
  resolveSession,
} from "../db/users";
import type { AppContext } from "./context";
import { SESSION_COOKIE, clearCookie, readCookie, sessionCookie } from "./context";

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

export default auth;
