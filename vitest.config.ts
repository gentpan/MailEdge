import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// 集成测试用真实 D1，表结构直接来自 migrations，避免测试里另抄一份 schema 而与线上漂移
const migrations = await readD1Migrations("./migrations");

/**
 * 测试跑在真实的 workerd 里，而不是 Node 模拟环境。
 * 这样 crypto.subtle、cloudflare:sockets、D1、Durable Object
 * 的行为与线上一致，不会出现「本地过、线上炸」。
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      // Durable Object RPC tests need the current worker entrypoint so the pool
      // can resolve the MailboxDO class behind the MAILBOX binding.
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-07-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: { DB: "mailedge-test" },
        r2Buckets: ["R2"],
        durableObjects: { MAILBOX: { className: "MailboxDO", useSQLite: true } },
        bindings: {
          TEST_MIGRATIONS: migrations,
          // 固定 32 字节密钥，测试里不需要真随机
          ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          SESSION_SECRET: "test-session-secret",
          SMART_ATTACHMENT_THRESHOLD: "3145728",
          MAX_EMAIL_SIZE: "4718592",
          ATTACHMENT_LINK_TTL_DAYS: "7",
          APP_URL: "https://mailedge.test",
          DEPLOYER_URL: "https://mailedge.test/deployer",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
