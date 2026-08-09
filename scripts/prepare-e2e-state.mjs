import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerRoot = path.join(projectRoot, ".wrangler");
const e2eState = path.join(wranglerRoot, "e2e");

// This guard is intentionally strict: browser tests may rebuild only the dedicated
// E2E state. In particular, they must never touch a developer's .wrangler/state.
if (
  path.dirname(e2eState) !== wranglerRoot ||
  path.basename(e2eState) !== "e2e" ||
  e2eState === path.join(wranglerRoot, "state")
) {
  throw new Error(`Refusing to reset unsafe Wrangler path: ${e2eState}`);
}

await rm(e2eState, { recursive: true, force: true });
await mkdir(e2eState, { recursive: true });
console.log(`[MailEdge E2E] Reset isolated Wrangler state: ${path.relative(projectRoot, e2eState)}`);
