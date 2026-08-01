import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  decryptJson,
  encryptJson,
  hashPassword,
  sha256Hex,
  timingSafeEqual,
  verifyPassword,
} from "../src/lib/crypto";

const KEY = bytesToBase64(new Uint8Array(32).fill(7));
const OTHER_KEY = bytesToBase64(new Uint8Array(32).fill(9));

describe("encryptJson / decryptJson", () => {
  it("往返还原任意 JSON 结构", async () => {
    const value = { apiKey: "re_123", domains: ["a.com", "b.com"], nested: { n: 1, ok: true } };
    const packed = await encryptJson(KEY, value);
    expect(await decryptJson(KEY, packed)).toEqual(value);
  });

  it("同一明文两次加密结果不同（IV 随机）", async () => {
    const a = await encryptJson(KEY, { x: 1 });
    const b = await encryptJson(KEY, { x: 1 });
    expect(a).not.toBe(b);
  });

  it("换密钥解不开", async () => {
    const packed = await encryptJson(KEY, { secret: "x" });
    await expect(decryptJson(OTHER_KEY, packed)).rejects.toThrow();
  });

  it("密文被篡改则解密失败（GCM 完整性）", async () => {
    const packed = await encryptJson(KEY, { secret: "x" });
    const bytes = base64ToBytes(packed);
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0xff;
    await expect(decryptJson(KEY, bytesToBase64(bytes))).rejects.toThrow();
  });

  it("长度不足的密文直接报错，而不是抛底层异常", async () => {
    await expect(decryptJson(KEY, bytesToBase64(new Uint8Array(8)))).rejects.toThrow("密文格式不正确");
  });

  it("密钥不是 32 字节时给出可操作的提示", async () => {
    await expect(encryptJson(bytesToBase64(new Uint8Array(16)), {})).rejects.toThrow(/32 字节/);
  });

  it("正确处理非 ASCII 内容", async () => {
    const value = { name: "设计稿 📎", note: "こんにちは" };
    expect(await decryptJson(KEY, await encryptJson(KEY, value))).toEqual(value);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("同口令 + 同盐 得到同哈希", async () => {
    const first = await hashPassword("hunter2");
    const second = await hashPassword("hunter2", first.salt);
    expect(second.hash).toBe(first.hash);
  });

  it("同口令不同盐 得到不同哈希", async () => {
    const a = await hashPassword("hunter2");
    const b = await hashPassword("hunter2");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("校验正确口令通过、错误口令拒绝", async () => {
    const { hash, salt } = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash, salt)).toBe(true);
    expect(await verifyPassword("Correct horse", hash, salt)).toBe(false);
    expect(await verifyPassword("", hash, salt)).toBe(false);
  });

  it("支持非 ASCII 口令", async () => {
    const { hash, salt } = await hashPassword("密码🔒password");
    expect(await verifyPassword("密码🔒password", hash, salt)).toBe(true);
  });
});

describe("timingSafeEqual", () => {
  it("长度不同直接不等", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("内容相同为真、单字符差异为假", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("空串相等", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("与已知向量一致", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("输出恒为 64 位小写十六进制", async () => {
    expect(await sha256Hex("")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("base64 编解码", () => {
  it("字节数组往返一致", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });

  it("接受 URL 安全变体", () => {
    const bytes = new Uint8Array([251, 255, 190, 255]);
    const urlSafe = bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_");
    expect([...base64ToBytes(urlSafe)]).toEqual([...bytes]);
  });

  it("大数组不触发栈溢出（分块处理）", () => {
    const bytes = new Uint8Array(200_000).fill(65);
    expect(base64ToBytes(bytesToBase64(bytes)).byteLength).toBe(200_000);
  });
});
