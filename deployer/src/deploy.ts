/**
 * 部署执行器：在隔离的 MailEdge 工作副本里跑 `npm run setup -- --yes`，
 * 把用户的一次性 token 注入为 wrangler 认证环境变量。
 * 输出实时进内存日志，供前端轮询。
 */
import { spawn } from "node:child_process";
import { prepareWorkspace, WORKSPACE_DIR } from "./workspace";

export interface DeployJob {
  id: string;
  status: "running" | "done" | "failed";
  log: string;
  url?: string;
  error?: string;
}

const jobs = new Map<string, DeployJob>();
let seq = 0;

export function getJob(id: string): DeployJob | undefined {
  return jobs.get(id);
}

export async function startDeploy(token: string, accountId: string): Promise<string> {
  const id = `deploy-${Date.now()}-${seq++}`;
  const job: DeployJob = { id, status: "running", log: "" };
  jobs.set(id, job);

  runJob(job, token, accountId).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
  });
  return id;
}

async function runJob(job: DeployJob, token: string, accountId: string): Promise<void> {
  append(job, "▶ 准备 MailEdge 工作副本…\n");
  try {
    prepareWorkspace();
  } catch (error) {
    append(job, `✗ ${error instanceof Error ? error.message : String(error)}\n`);
    job.status = "failed";
    job.error = "工作副本准备失败";
    return;
  }
  append(job, "✓ 工作副本就绪，开始部署（首次可能耗时几分钟）…\n\n");

  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    };
    const child = spawn("npm", ["run", "setup", "--", "--yes"], {
      cwd: WORKSPACE_DIR,
      env,
      shell: process.platform === "win32",
    });

    child.stdout?.on("data", (chunk: Buffer) => append(job, chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => append(job, chunk.toString()));

    child.on("close", (code) => {
      const url = extractDeployedUrl(job.log);
      if (url) {
        append(job, `\n✓ 部署完成：${url}\n`);
        job.url = url;
        job.status = "done";
      } else if (code === 0) {
        // setup 可能因各种原因没输出 workers.dev 地址（如自定义域名），
        // 但命令成功，视为完成
        append(job, "\n✓ 部署命令执行成功（未识别到 workers.dev 地址，请在日志中查看）\n");
        job.status = "done";
      } else {
        append(job, "\n✗ 部署失败，见上方日志。可修复后重新部署。\n");
        job.status = "failed";
        job.error = "部署失败，详见日志";
      }
      resolve();
    });

    child.on("error", (error) => {
      append(job, `\n✗ 无法启动部署进程：${error.message}\n`);
      job.status = "failed";
      job.error = error.message;
      resolve();
    });
  });
}

function append(job: DeployJob, text: string): void {
  job.log += text;
}

/** 从部署日志里提取 workers.dev 访问地址 */
export function extractDeployedUrl(text: string): string | undefined {
  const match = /https:\/\/[^\s"']*\.workers\.dev[^\s"']*/.exec(text ?? "");
  return match ? match[0].replace(/[).,]+$/, "") : undefined;
}
