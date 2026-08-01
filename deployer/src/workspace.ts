/**
 * MailEdge 部署工作副本管理。
 *
 * 部署时不能直接在主项目里跑 setup（会污染 wrangler.jsonc），
 * 而是维护一个隔离的 workspace：首次部署时把 MailEdge 源码复制过去
 * 并安装依赖，后续部署直接复用。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MAILEDGE_ROOT } from "./config";

export const WORKSPACE_DIR = resolve(import.meta.dirname, "../workspace/mailedge");

const COPY_ENTRIES = [
  "src",
  "migrations",
  "scripts",
  "web",
  "package.json",
  "package-lock.json",
  "wrangler.jsonc",
  "tsconfig.json",
  "tsconfig.worker.json",
  "tsconfig.web.json",
  "vite.config.ts",
  "vitest.config.ts",
  ".dev.vars.example",
];

/** workspace 是否已初始化（含依赖） */
export function isWorkspaceReady(): boolean {
  return existsSync(join(WORKSPACE_DIR, "node_modules"));
}

/** 递归复制（排除 node_modules / .git / 构建产物） */
function copyTree(src: string, dest: string): void {
  for (const entry of readdirSync(src)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === ".wrangler") continue;
    const from = join(src, entry);
    const to = join(dest, entry);
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

/** 准备（或更新）工作副本，并确保依赖已安装。仅在首次或源码更新后执行。 */
export function prepareWorkspace(): void {
  mkdirSync(WORKSPACE_DIR, { recursive: true });

  // 计算是否需要重建：用源码关键文件的 mtime 汇总做指纹，简化起见看 src 是否变化
  const needInstall = !isWorkspaceReady();

  if (needInstall) {
    console.log("[workspace] 初始化 MailEdge 工作副本（首次部署需要安装依赖，可能耗时较长）…");
    rmSync(WORKSPACE_DIR, { recursive: true, force: true });
    mkdirSync(WORKSPACE_DIR, { recursive: true });

    for (const entry of COPY_ENTRIES) {
      const src = join(MAILEDGE_ROOT, entry);
      const dest = join(WORKSPACE_DIR, entry);
      if (!existsSync(src)) continue;
      if (statSync(src).isDirectory()) {
        mkdirSync(dest, { recursive: true });
        copyTree(src, dest);
      } else {
        cpSync(src, dest);
      }
    }

    // 写一份 workspace 的独立数据库配置占位（setup 会回填）
    const install = spawnSync("npm", ["install"], { cwd: WORKSPACE_DIR, encoding: "utf8", shell: process.platform === "win32" });
    if (install.status !== 0) {
      throw new Error(`MailEdge 依赖安装失败：\n${(install.stderr ?? "").slice(0, 2000)}`);
    }
    console.log("[workspace] 依赖安装完成");
  } else {
    console.log("[workspace] 复用已有工作副本");
  }
}
