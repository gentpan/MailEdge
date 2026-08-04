import { Hono } from "hono";
import packageJson from "../../package.json";
import { requireAuth } from "./auth";
import type { AppContext } from "./context";

/**
 * 版本检查入口。
 *
 * Worker 不保存 Cloudflare 部署凭据，也不尝试从运行中的 Worker 自更新。
 * 实际升级统一在 mailedge.sh 完成，用户可以在那里使用 OAuth 或一次性 Token。
 */
const update = new Hono<AppContext>();
update.use("*", requireAuth);

/** 当前运行版本，以及安装向导工作副本中可部署的版本。 */
update.get("/version", async (c) => {
  const currentVersion = packageJson.version;
  let availableVersion: string | null = null;
  let source: "deployer" | null = null;

  if (c.env.DEPLOYER_URL) {
    try {
      const res = await fetch(`${c.env.DEPLOYER_URL.replace(/\/+$/, "")}/api/version`);
      const data = (await res.json().catch(() => null)) as { version?: string } | null;
      if (res.ok && data?.version && data.version !== "unknown") {
        availableVersion = data.version;
        source = "deployer";
      }
    } catch {
      // 版本检测失败不应阻止更新配置和手动更新，前端会显示“暂不可用”。
    }
  }

  return c.json({
    currentVersion,
    availableVersion,
    updateAvailable: Boolean(availableVersion && availableVersion !== currentVersion),
    source,
    checkedAt: new Date().toISOString(),
  });
});

export default update;
