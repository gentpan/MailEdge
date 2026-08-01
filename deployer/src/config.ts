/** 指向 MailEdge 主项目（部署模板来源）。可通过环境变量覆盖。 */
import { resolve } from "node:path";

/** MailEdge 项目根目录（默认是 deployer 的上一级） */
export const MAILEDGE_ROOT = resolve(import.meta.dirname, "../..");

export const MAILEDGE_WORKER_ENTRY = resolve(MAILEDGE_ROOT, "src/index.ts");
export const MAILEDGE_FRONTEND_DIST = resolve(MAILEDGE_ROOT, "web/dist");
export const MAILEDGE_MIGRATIONS_DIR = resolve(MAILEDGE_ROOT, "migrations");
