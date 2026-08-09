import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CatchAllConflictError,
  CatchAllDeleteProtectedError,
  createMailbox,
  deleteMailbox,
  findByAddress,
  getCatchAllByDomain,
  getMailbox,
  updateMailboxSettings,
} from "../src/db/mailboxes";
import type { Env } from "../src/env";

const workerEnv = env as unknown as Env;
const USER_ID = "user_catchall_test";
const OTHER_USER_ID = "user_catchall_other";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mailboxes"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare(
      `INSERT INTO users (id, email, name, password_hash, password_salt, role)
       VALUES (?, ?, ?, ?, ?, 'admin')`,
    ).bind(USER_ID, "admin@example.com", "Admin", "hash", "salt"),
    env.DB.prepare(
      `INSERT INTO users (id, email, name, password_hash, password_salt, role)
       VALUES (?, ?, ?, ?, ?, 'user')`,
    ).bind(OTHER_USER_ID, "other@example.com", "Other", "hash", "salt"),
  ]);
});

describe("catch-all address matching", () => {
  it("prefers an exact address, then falls back within the same domain", async () => {
    const fallback = await createMailbox(workerEnv, {
      address: "inbox@example.com",
      userId: USER_ID,
      isCatchAll: true,
    });
    const exact = await createMailbox(workerEnv, {
      address: "support@example.com",
      userId: USER_ID,
    });

    await expect(findByAddress(workerEnv, "SUPPORT@example.com")).resolves.toMatchObject({
      mailbox: { id: exact.id },
      exact: true,
    });
    await expect(findByAddress(workerEnv, "anything@example.com")).resolves.toMatchObject({
      mailbox: { id: fallback.id },
      exact: false,
    });
    await expect(findByAddress(workerEnv, "anything@other.test")).resolves.toBeNull();
  });

  it("keeps catch-all routing isolated per domain", async () => {
    const example = await createMailbox(workerEnv, {
      address: "inbox@example.com",
      userId: USER_ID,
      isCatchAll: true,
    });
    const other = await createMailbox(workerEnv, {
      address: "inbox@other.test",
      userId: USER_ID,
      isCatchAll: true,
    });

    expect((await findByAddress(workerEnv, "x@example.com"))?.mailbox.id).toBe(example.id);
    expect((await findByAddress(workerEnv, "x@other.test"))?.mailbox.id).toBe(other.id);
  });
});

describe("catch-all lifecycle safety", () => {
  it("rejects a second catch-all on the same domain at both service and database levels", async () => {
    await createMailbox(workerEnv, {
      address: "first@example.com",
      userId: USER_ID,
      isCatchAll: true,
    });

    await expect(
      createMailbox(workerEnv, {
        address: "second@example.com",
        userId: USER_ID,
        isCatchAll: true,
      }),
    ).rejects.toBeInstanceOf(CatchAllConflictError);

    await expect(
      env.DB.prepare(
        `INSERT INTO mailboxes (id, address, user_id, do_name, is_catch_all, domain)
         VALUES (?, ?, ?, ?, 1, ?)`,
      )
        .bind(
          "mb_direct_duplicate",
          "direct@example.com",
          USER_ID,
          "mailbox:direct@example.com",
          "example.com",
        )
        .run(),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("atomically switches the domain fallback to another mailbox", async () => {
    const current = await createMailbox(workerEnv, {
      address: "first@example.com",
      userId: USER_ID,
      isCatchAll: true,
    });
    const next = await createMailbox(workerEnv, {
      address: "second@example.com",
      userId: USER_ID,
    });

    await updateMailboxSettings(workerEnv, USER_ID, next.id, { isCatchAll: true });

    expect((await getMailbox(workerEnv, current.id))?.isCatchAll).toBe(false);
    expect((await getMailbox(workerEnv, next.id))?.isCatchAll).toBe(true);
    expect((await getCatchAllByDomain(workerEnv, "EXAMPLE.COM"))?.id).toBe(next.id);
    expect((await findByAddress(workerEnv, "unknown@example.com"))?.mailbox.id).toBe(next.id);
  });

  it("does not let another user replace the domain fallback", async () => {
    const existing = await createMailbox(workerEnv, {
      address: "owner@example.com",
      userId: OTHER_USER_ID,
      isCatchAll: true,
    });
    const candidate = await createMailbox(workerEnv, {
      address: "candidate@example.com",
      userId: USER_ID,
    });

    await expect(
      updateMailboxSettings(workerEnv, USER_ID, candidate.id, { isCatchAll: true }),
    ).rejects.toBeInstanceOf(CatchAllConflictError);

    expect((await getMailbox(workerEnv, existing.id))?.isCatchAll).toBe(true);
    expect((await getMailbox(workerEnv, candidate.id))?.isCatchAll).toBe(false);
  });

  it("requires explicit confirmation before deleting a catch-all mailbox", async () => {
    const mailbox = await createMailbox(workerEnv, {
      address: "inbox@example.com",
      userId: USER_ID,
      isCatchAll: true,
    });

    await expect(deleteMailbox(workerEnv, mailbox.id)).rejects.toBeInstanceOf(CatchAllDeleteProtectedError);
    expect(await getMailbox(workerEnv, mailbox.id)).not.toBeNull();

    await deleteMailbox(workerEnv, mailbox.id, { allowCatchAll: true });
    expect(await getMailbox(workerEnv, mailbox.id)).toBeNull();
    expect(await findByAddress(workerEnv, "unknown@example.com")).toBeNull();
  });

  it("can disable catch-all without deleting the mailbox", async () => {
    const mailbox = await createMailbox(workerEnv, {
      address: "inbox@example.com",
      userId: USER_ID,
      isCatchAll: true,
    });

    const updated = await updateMailboxSettings(workerEnv, USER_ID, mailbox.id, {
      isCatchAll: false,
    });

    expect(updated?.isCatchAll).toBe(false);
    expect(await findByAddress(workerEnv, "inbox@example.com")).toMatchObject({ exact: true });
    expect(await findByAddress(workerEnv, "unknown@example.com")).toBeNull();
  });
});
