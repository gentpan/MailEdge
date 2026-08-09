import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("D1 migration runner contract", () => {
  it("applies 0001 through 0007 exactly once and treats a second run as a no-op", async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    const first = await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>();

    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    const second = await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>();

    expect(first.results.map((row) => row.name)).toEqual([
      "0001_init.sql",
      "0002_auth_recovery.sql",
      "0003_storage_backend.sql",
      "0004_retention.sql",
      "0005_custom_folders.sql",
      "0006_contacts.sql",
      "0007_catchall_safety.sql",
    ]);
    expect(second.results).toEqual(first.results);

    const settings = await env.DB.prepare("SELECT key, value FROM settings ORDER BY key").all<{
      key: string;
      value: string;
    }>();
    expect(settings.results).toEqual([
      { key: "outbound_retention_days", value: "365" },
      { key: "storage_backend", value: "r2" },
    ]);
  });
});
