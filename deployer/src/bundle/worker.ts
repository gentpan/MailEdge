import { build } from "esbuild";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { MAILEDGE_FRONTEND_DIST, MAILEDGE_WORKER_ENTRY } from "../config";

/**
 * 用 esbuild 把 MailEdge 的 Worker 入口打包成单一 ESM 文件。
 * `cloudflare:*` 是 Worker 运行时内置模块，保持 external，由线上环境提供。
 */
export async function bundleWorker(): Promise<string> {
  const result = await build({
    entryPoints: [MAILEDGE_WORKER_ENTRY],
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "neutral",
    conditions: ["worker"],
    external: ["cloudflare:*", "node:*"],
    minify: true,
    sourcemap: false,
    write: false,
    logLevel: "warning",
  });
  const out = result.outputFiles[0];
  if (!out) throw new Error("esbuild 没有产出任何文件");
  return out.text;
}

/** 递归列出前端构建产物的文件清单（相对路径 + 内容） */
export function collectAssets(dir: string = MAILEDGE_FRONTEND_DIST): Array<{ path: string; content: Uint8Array }> {
  const files: Array<{ path: string; content: Uint8Array }> = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const rel = full.slice(dir.length + 1);
        files.push({ path: rel, content: readFileSync(full) });
      }
    }
  };
  walk(dir);
  return files;
}
