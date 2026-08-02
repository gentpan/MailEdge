#!/usr/bin/env node
/**
 * MailEdge 一键部署。
 *
 * 把 README「部署」一节里的手工活全部自动化：建 D1、把 database_id 回填进
 * wrangler.jsonc、建 R2、生成并写入两个机密、建表、部署、回填 APP_URL。
 *
 * 设计前提：
 *   1. 幂等——重复跑不会重复建资源，也不会覆盖已有机密
 *   2. 不静默做危险动作——改动前先列计划、要确认；已存在的 ENCRYPTION_KEY 绝不覆盖
 *   3. 不碰凭据——认证交给 `wrangler login`，本脚本从不读取、传递、打印任何 API Key
 *
 * 用法：
 *   npm run setup           交互式
 *   npm run setup -- --yes  跳过确认（CI 用）
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  extractDeployedUrl,
  extractJson,
  hasBucket,
  isUnauthenticated,
  parseAccount,
  parseJsonc,
  replaceStringValue,
} from "./lib/config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "wrangler.jsonc");
const AUTO_YES = process.argv.includes("--yes") || process.argv.includes("-y");

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const log = {
  step: (n, total, message) => console.log(`\n${C.bold}[${n}/${total}] ${message}${C.reset}`),
  info: (message) => console.log(`      ${message}`),
  dim: (message) => console.log(`      ${C.dim}${message}${C.reset}`),
  ok: (message) => console.log(`      ${C.green}[OK]${C.reset} ${message}`),
  warn: (message) => console.log(`      ${C.yellow}[WARN]${C.reset} ${message}`),
  fail: (message) => console.error(`\n${C.red}[FAIL]${C.reset} ${message}`),
};

class SetupError extends Error {
  /** @param {string} message @param {string[]} [hints] 可操作的补救建议 */
  constructor(message, hints = []) {
    super(message);
    this.hints = hints;
  }
}

// ---------------------------------------------------------------------------
// 执行 wrangler
// ---------------------------------------------------------------------------

/** 跑一条 wrangler 命令，输出直通终端（用于建资源、部署这类需要看进度的） */
function wrangler(args, { allowFailure = false } = {}) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0 && !allowFailure) {
    throw new SetupError(`wrangler ${args.join(" ")} 执行失败`);
  }
  return result.status === 0;
}

/** 跑一条 wrangler 命令并捕获输出（用于查询） */
function wranglerCapture(args) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// wrangler.jsonc 读写
//
// 配置文件带注释，JSON.parse 会丢掉它们，所以读用「剥注释后解析」、
// 写用「定点正则替换」，注释和排版原样保留。
// 两者的实现在 ./lib/config.mjs，由 test/setup-config.test.ts 覆盖。
// ---------------------------------------------------------------------------

function readConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new SetupError("找不到 wrangler.jsonc，请在项目根目录运行");
  }
  return readFileSync(CONFIG_PATH, "utf8");
}

function parseConfig(raw) {
  try {
    return parseJsonc(raw);
  } catch {
    throw new SetupError("wrangler.jsonc 解析失败，请检查是否有语法错误");
  }
}

function replaceConfigValue(raw, key, value) {
  const next = replaceStringValue(raw, key, value);
  if (next === null) {
    throw new SetupError(`wrangler.jsonc 里找不到 "${key}" 字段`);
  }
  return next;
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

/** @type {import("node:readline/promises").Interface | null} */
let rl = null;

async function confirm(question, { defaultYes = true } = {}) {
  if (AUTO_YES) return true;

  rl ??= createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await rl.question(`\n${C.cyan}?${C.reset} ${question} ${suffix} `)).trim().toLowerCase();

  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

// ---------------------------------------------------------------------------
// 各步骤
// ---------------------------------------------------------------------------

function checkAuth() {
  const { stdout, stderr } = wranglerCapture(["whoami"]);
  const output = stdout + stderr;

  // 注意：未登录时 wrangler whoami 的退出码仍是 0，只能看输出内容
  if (isUnauthenticated(output)) {
    throw new SetupError("尚未登录 Cloudflare", [
      "先跑一次 OAuth 授权（凭据由 wrangler 自己保管）：",
      "  npx wrangler login",
    ]);
  }

  const account = parseAccount(output);
  if (account) {
    log.ok(`已登录：${account.name}`);
    log.dim(`账号 ID ${account.id}`);
  } else {
    log.ok("已登录");
  }
}

/** 兼容不同 wrangler 版本的 D1 记录字段名（uuid / database_id） */
function d1IdOf(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  return record.database_id ?? record.uuid ?? record.result?.database_id ?? record.result?.uuid ?? null;
}

/** 从 wrangler 输出里按名字找数据库 ID（`d1 list --json` 是数组） */
function findDatabaseId(wrangled, name) {
  const list = wrangled.ok ? extractJson(wrangled.stdout) : null;
  if (!Array.isArray(list)) return null;
  const row = list.find((item) => item?.name === name);
  return row ? d1IdOf(row) : null;
}

/** 建 D1（或复用已有的），返回 database_id */
function ensureDatabase(name) {
  const existingId = findDatabaseId(wranglerCapture(["d1", "list", "--json"]), name);

  if (existingId) {
    log.ok(`D1 数据库 ${name} 已存在`);
    log.dim(`database_id ${existingId}`);
    return existingId;
  }

  log.info(`创建 D1 数据库 ${name} …`);
  // capture 而非直通，便于从输出里提取 database_id；末尾的交互提示一并带走
  const created = wranglerCapture(["d1", "create", name]);
  if (!created.ok) {
    throw new SetupError(`wrangler d1 create ${name} 执行失败`);
  }

  // 优先从 create 输出里提取（wrangler 会打印 database_id 配置片段）
  const fromCreate = /"database_id"\s*:\s*"([0-9a-fA-F-]{8,})"/.exec(created.stdout)?.[1];
  let id = fromCreate ?? null;

  // 兜底：重新列表一次
  if (!id) {
    id = findDatabaseId(wranglerCapture(["d1", "list", "--json"]), name);
  }

  if (!id) {
    throw new SetupError("数据库已创建，但读不到 database_id", [
      "手动执行下面的命令，把输出里的 database_id 填进 wrangler.jsonc：",
      `  npx wrangler d1 list`,
    ]);
  }

  log.ok(`D1 数据库已创建`);
  log.dim(`database_id ${id}`);
  return id;
}

function ensureBucket(name) {
  const list = wranglerCapture(["r2", "bucket", "list"]);

  if (!list.ok) {
    throw new SetupError(`无法读取 R2 存储桶列表：${name}`, [
      "请确认一次性 Token 包含 R2 编辑权限，并在同一 Cloudflare 账户下重试：",
      "  npx wrangler r2 bucket list",
    ]);
  }

  if (hasBucket(list.stdout, name)) {
    log.ok(`R2 存储桶 ${name} 已存在`);
    return;
  }

  log.info(`创建 R2 存储桶 ${name} …`);
  const created = wrangler(["r2", "bucket", "create", name], { allowFailure: true });
  if (!created) {
    throw new SetupError(`R2 存储桶 ${name} 创建失败`, [
      "请检查 Token 的 R2 编辑权限、Cloudflare 账户和存储桶名称后重试。",
    ]);
  }

  // Wrangler 返回成功后再列一次，避免命令输出成功但实际账户中没有桶时继续部署。
  const verified = wranglerCapture(["r2", "bucket", "list"]);
  if (!verified.ok || !hasBucket(verified.stdout, name)) {
    throw new SetupError(`R2 存储桶 ${name} 创建后校验失败`, [
      "请在当前 Cloudflare 账户的 R2 页面确认桶是否存在，再重试部署。",
    ]);
  }
  log.ok("R2 存储桶已创建");
}

/**
 * 写入缺失的机密。
 *
 * 已存在的一律不动：ENCRYPTION_KEY 是 mail_providers.config_encrypted 的
 * 主密钥，换掉它等于把所有已保存的渠道密钥作废，且不可逆。
 */
function ensureSecrets(workerName) {
  const listed = wranglerCapture(["secret", "list", "--format", "json"]);
  const parsed = listed.ok ? extractJson(listed.stdout) : null;

  if (!listed.ok || !Array.isArray(parsed)) {
    // 读不到已有机密就无从判断是否会覆盖，宁可不写
    log.warn("读不到现有机密列表（Worker 可能尚未部署），跳过机密写入");
    log.dim("部署完成后重跑一次 npm run setup 即可补上");
    return { skipped: true };
  }

  const present = new Set(parsed.map((item) => item?.name).filter(Boolean));
  const written = [];

  for (const key of ["ENCRYPTION_KEY", "SESSION_SECRET"]) {
    if (present.has(key)) {
      log.ok(`${key} 已存在，保持不变`);
      continue;
    }

    const value = randomBytes(32).toString("base64");
    const result = spawnSync("npx", ["wrangler", "secret", "put", key, "--name", workerName], {
      cwd: ROOT,
      input: value,
      encoding: "utf8",
      shell: process.platform === "win32",
    });

    if (result.status !== 0) {
      throw new SetupError(`写入机密 ${key} 失败`, [
        (result.stderr ?? "").trim() || "可手动执行：npx wrangler secret put " + key,
      ]);
    }

    written.push(key);
    log.ok(`${key} 已生成并写入`);
  }

  if (written.includes("ENCRYPTION_KEY")) {
    log.warn("ENCRYPTION_KEY 是渠道密钥的主密钥，换掉它会作废所有已保存的发信配置");
  }

  return { skipped: false, written };
}

function deploy() {
  let version = "unknown";
  try {
    version = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version ?? version;
  } catch {
    // 版本号只是 Cloudflare 版本记录的辅助信息，读取失败不应阻断已有部署流程。
  }
  const deployArgs = ["run", "deploy"];
  if (version !== "unknown") {
    deployArgs.push("--", "--message", `MailEdge v${version}`, "--tag", `mailedge-v${version}`);
  }
  const result = spawnSync("npm", deployArgs, {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  const output = (result.stdout ?? "") + (result.stderr ?? "");
  process.stdout.write(output);

  if (result.status !== 0) {
    throw new SetupError("部署失败，详见上面的输出");
  }
  return extractDeployedUrl(output);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${C.bold}MailEdge 一键部署${C.reset}`);
  console.log(`${C.dim}本脚本不会读取或传递任何 API Key，认证全部交给 wrangler login${C.reset}`);

  const TOTAL = 7;
  let raw = readConfig();
  const config = parseConfig(raw);

  const workerName = config.name ?? "mailedge";
  const dbName = config.d1_databases?.[0]?.database_name ?? "mailedge";
  const bucketName = config.r2_buckets?.[0]?.bucket_name ?? "mailedge-attachments";
  const currentDbId = config.d1_databases?.[0]?.database_id ?? "";
  const currentAppUrl = config.vars?.APP_URL ?? "";

  log.step(1, TOTAL, "检查登录状态");
  checkAuth();

  console.log(`\n${C.bold}将要执行：${C.reset}`);
  console.log(`  · 创建或复用 D1 数据库    ${C.cyan}${dbName}${C.reset}`);
  console.log(`  · 创建或复用 R2 存储桶    ${C.cyan}${bucketName}${C.reset}`);
  console.log(`  · 生成缺失的机密          ${C.cyan}ENCRYPTION_KEY / SESSION_SECRET${C.reset}`);
  console.log(`  · 在远端数据库建表        ${C.cyan}migrations/${C.reset}`);
  console.log(`  · 部署 Worker             ${C.cyan}${workerName}${C.reset}`);
  console.log(`  · 回填 wrangler.jsonc     ${C.cyan}database_id / APP_URL${C.reset}`);
  console.log(`\n${C.dim}这些操作会在你的 Cloudflare 账号下创建资源并产生一次线上部署。${C.reset}`);

  if (!(await confirm("确认继续？"))) {
    console.log("\n已取消，未做任何改动。");
    return;
  }

  log.step(2, TOTAL, "准备 D1 数据库");
  const dbId = ensureDatabase(dbName);

  if (currentDbId && currentDbId !== dbId && !currentDbId.startsWith("REPLACE_WITH")) {
    log.warn(`wrangler.jsonc 里已有另一个 database_id：${currentDbId}`);
    if (!(await confirm("要改成上面查到的那个吗？", { defaultYes: false }))) {
      throw new SetupError("已中止，以免指向错误的数据库");
    }
  }

  if (currentDbId !== dbId) {
    raw = replaceConfigValue(raw, "database_id", dbId);
    writeFileSync(CONFIG_PATH, raw);
    log.ok("database_id 已回填进 wrangler.jsonc");
  }

  log.step(3, TOTAL, "准备 R2 存储桶");
  ensureBucket(bucketName);

  log.step(4, TOTAL, "建表");
  wrangler(["d1", "migrations", "apply", dbName, "--remote"]);
  log.ok("远端数据库表结构已就绪");

  log.step(5, TOTAL, "部署 Worker");
  const url = deploy();
  log.ok(url ? `已部署：${url}` : "已部署");

  log.step(6, TOTAL, "写入机密");
  const secrets = ensureSecrets(workerName);

  log.step(7, TOTAL, "回填访问地址");
  let redeployed = false;

  if (url && currentAppUrl !== url && /example\.com/.test(currentAppUrl)) {
    raw = replaceConfigValue(raw, "APP_URL", url);
    writeFileSync(CONFIG_PATH, raw);
    log.ok(`APP_URL 已设为 ${url}`);
    log.dim("附件下载链接用它拼绝对地址，改动需要再部署一次才生效");

    if (await confirm("现在重新部署以让 APP_URL 生效？")) {
      deploy();
      redeployed = true;
      log.ok("已重新部署");
    }
  } else if (currentAppUrl && !/example\.com/.test(currentAppUrl)) {
    log.ok(`APP_URL 保持为 ${currentAppUrl}`);
    log.dim("如果这不是你要用的正式域名，改完 wrangler.jsonc 后重新部署");
  } else {
    log.warn("没能从部署输出里识别出访问地址，请手动确认 wrangler.jsonc 的 APP_URL");
  }

  // -------------------------------------------------------------------------
  // 剩下两件事必须在 Cloudflare 面板做，脚本代劳不了
  // -------------------------------------------------------------------------

  console.log(`\n${C.green}${C.bold}自动化部分已完成。${C.reset}`);

  if (secrets.skipped) {
    console.log(`\n${C.yellow}机密尚未写入${C.reset}——Worker 刚刚才部署好，重跑一次即可补上：`);
    console.log(`  ${C.cyan}npm run setup${C.reset}`);
  }

  console.log(`\n${C.bold}接下来还有两步需要你在面板操作：${C.reset}\n`);

  console.log(`${C.bold}① 配置收件路由${C.reset}`);
  console.log("   Cloudflare 面板 -> Compute -> Email Service -> Email Routing -> 选择你的域名");
  console.log("   首次进入需先启用（会自动写入 MX 与 SPF 记录），然后 Routing Rules -> Create：");
  console.log(`     Email pattern  地址的本地部分，如 ${C.cyan}support${C.reset}`);
  console.log(`     Action         ${C.cyan}Send to a Worker${C.reset}`);
  console.log(`     Worker         ${C.cyan}${workerName}${C.reset}`);
  console.log(
    `   ${C.dim}想收整个域名的信就改用 Catch-all address，action 同样选 Send to a Worker。${C.reset}`,
  );

  console.log(`\n${C.bold}② 初始化管理员${C.reset}`);
  console.log(`   打开 ${C.cyan}${url ?? "你的部署地址"}${C.reset}，首次访问会进入初始化页。`);
  console.log(`   ${C.yellow}这里填的收件地址必须和上一步的路由规则完全一致${C.reset}，`);
  console.log("   否则 Worker 收到信找不到对应信箱，会直接退信（550 未知收件人）。");
  console.log("\n   之后到「设置 -> 发信服务」配置渠道，先「测试发送」确认可用，再「设为默认」。");
  console.log(`\n${C.dim}发往任意外部邮箱需要 Workers Paid；收件在免费计划即可用。${C.reset}`);

  if (!redeployed && url) {
    console.log(`\n${C.dim}提示：若之后改了 wrangler.jsonc 里的 vars，需要重新 npm run deploy。${C.reset}`);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof SetupError) {
    log.fail(error.message);
    for (const hint of error.hints) console.error(`  ${hint}`);
    console.error(`\n${C.dim}修好后重跑 npm run setup 即可，已完成的步骤会自动跳过。${C.reset}`);
  } else {
    log.fail(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
} finally {
  rl?.close();
}
