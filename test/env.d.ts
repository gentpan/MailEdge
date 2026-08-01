import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import type { Env as AppEnv } from "../src/env";

/**
 * `cloudflare:test` 导出的 env 类型是 Cloudflare.Env，
 * 这里把它对齐到 Worker 真正的 Env，并加上测试专用的 migrations 绑定。
 */
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      /** 由 vitest.config.ts 注入，供 applyD1Migrations 建表 */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
