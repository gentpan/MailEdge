import { applyD1Migrations, env, evictDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { StoreMessageInput } from "../src/do/mailbox";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

function fixture(id: string): StoreMessageInput {
  return {
    id,
    internalId: `internal-${id}`,
    direction: "inbound",
    folder: "inbox",
    messageId: `<${id}@sender.example>`,
    from: { email: "sender@example.com", name: "Migration Sender" },
    to: [{ email: "owner@example.com", name: "Owner" }],
    subject: "Durable Object persistence fixture",
    html: "<h1>Persistent HTML</h1><p>This body must survive archival.</p>",
    text: "Persistent text body",
    headers: { "x-migration-fixture": "preserve-me" },
    size: 8192,
    receivedAt: "2020-01-01T00:00:00.000Z",
    attachments: [
      {
        id: `attachment-${id}`,
        filename: "evidence.pdf",
        contentType: "application/pdf",
        size: 4096,
        mode: "inline",
        r2Key: `inbound/mb_persistence/${id}/evidence.pdf`,
        token: null,
      },
    ],
  };
}

describe("mailbox Durable Object persistence", () => {
  it("keeps message, attachment, state, and archived body across fresh stub handles", async () => {
    const suffix = crypto.randomUUID();
    const messageId = `message-${suffix}`;
    const namespaceId = env.MAILBOX.idFromName(`qa:persistence:${suffix}`);
    const first = env.MAILBOX.get(namespaceId);

    await first.store(fixture(messageId));
    await first.setCategory(messageId, "important");
    await first.setSummary(messageId, "Preserved AI summary");
    await first.setRead(messageId, true);
    await first.setStarred(messageId, true);
    await first.move(messageId, "archive");

    const beforeArchive = await first.get(messageId);
    expect(beforeArchive).toMatchObject({
      id: messageId,
      folder: "archive",
      category: "important",
      aiSummary: "Preserved AI summary",
      isRead: true,
      isStarred: true,
      html: "<h1>Persistent HTML</h1><p>This body must survive archival.</p>",
      text: "Persistent text body",
      headers: { "x-migration-fixture": "preserve-me" },
      attachments: [
        {
          id: `attachment-${messageId}`,
          filename: "evidence.pdf",
          contentType: "application/pdf",
          size: 4096,
        },
      ],
    });

    const archived = await first.archiveOldMessages("mb_persistence", "2021-01-01T00:00:00.000Z", 10);
    expect(archived).toEqual({ archived: 1, hasMore: false });

    // Force a real actor restart, then acquire a new handle. This verifies the
    // SQLite/object-storage state rather than relying on the existing JS object.
    await evictDurableObject(first);
    const reopened = env.MAILBOX.get(namespaceId);
    const afterArchive = await reopened.get(messageId);
    expect(afterArchive).toMatchObject({
      id: messageId,
      folder: "archive",
      category: "important",
      aiSummary: "Preserved AI summary",
      isRead: true,
      isStarred: true,
      html: "<h1>Persistent HTML</h1><p>This body must survive archival.</p>",
      text: "Persistent text body",
      headers: { "x-migration-fixture": "preserve-me" },
      attachments: [{ id: `attachment-${messageId}`, filename: "evidence.pdf" }],
    });

    await expect(reopened.listAttachments()).resolves.toMatchObject([
      {
        id: `attachment-${messageId}`,
        messageId,
        filename: "evidence.pdf",
        r2Key: `inbound/mb_persistence/${messageId}/evidence.pdf`,
      },
    ]);
    await expect(reopened.usage()).resolves.toMatchObject({
      messages: 1,
      attachments: 1,
      archivedMessages: 1,
    });
  });
});
