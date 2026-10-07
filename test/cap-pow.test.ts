import { describe, expect, it } from "vitest";
import { solveCapItem } from "../web/src/lib/capPow";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 用标准 SHA-256 从 0 往上找第一个满足的 nonce */
async function bruteForce(salt: string, target: string): Promise<number> {
  for (let n = 0; ; n++) {
    if ((await sha256Hex(`${salt}${n}`)).startsWith(target)) return n;
  }
}

describe("Cap 算题（和服务端、网鱼论坛同一个口径）", () => {
  it("找到的 nonce 让 sha256(盐 + nonce) 以目标前缀开头，而且是最小的那个", async () => {
    const salts = ["0123456789abcdef01234567", "ffffffffffffffffffffffff", "a1b2c3d4e5f60718293a4b5c"];
    for (const salt of salts) {
      for (const target of ["0", "a", "3f", "c0"]) {
        const n = solveCapItem(salt, target);
        expect((await sha256Hex(`${salt}${n}`)).startsWith(target)).toBe(true);
        expect(n).toBe(await bruteForce(salt, target));
      }
    }
  });

  it("难度 4（线上用的）也算得出", async () => {
    const salt = "9f8e7d6c5b4a39281706f5e4";
    const n = solveCapItem(salt, "beef");
    expect((await sha256Hex(`${salt}${n}`)).startsWith("beef")).toBe(true);
  });
});
