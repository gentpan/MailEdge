import { describe, expect, it } from "vitest";
import { base64UrlEncode, newId, newMessageId, randomToken, ulid } from "../src/lib/id";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
  it("恒为 26 位 Crockford Base32", () => {
    for (let i = 0; i < 50; i++) expect(ulid()).toMatch(CROCKFORD);
  });

  it("时间靠后的 ULID 字典序更大（可直接当主键排序）", () => {
    const early = ulid(1_700_000_000_000);
    const late = ulid(1_800_000_000_000);
    expect(early < late).toBe(true);
  });

  it("同一毫秒内前 10 位（时间部分）一致", () => {
    const at = 1_750_000_000_000;
    expect(ulid(at).slice(0, 10)).toBe(ulid(at).slice(0, 10));
  });

  it("同一毫秒内随机部分不同", () => {
    const at = 1_750_000_000_000;
    const generated = new Set(Array.from({ length: 100 }, () => ulid(at)));
    expect(generated.size).toBe(100);
  });

  it("时间为 0 时不产生空洞，仍是合法 26 位", () => {
    expect(ulid(0)).toMatch(CROCKFORD);
    expect(ulid(0).slice(0, 10)).toBe("0000000000");
  });
});

describe("newMessageId / newId", () => {
  it("邮件 ID 带 mail_ 前缀", () => {
    expect(newMessageId()).toMatch(/^mail_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("newId 保留传入前缀", () => {
    expect(newId("box")).toMatch(/^box_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe("randomToken", () => {
  it("URL 安全：不含 + / =", () => {
    for (let i = 0; i < 30; i++) expect(randomToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("默认 32 字节 → 43 个字符", () => {
    expect(randomToken().length).toBe(43);
  });

  it("字节数可调", () => {
    expect(randomToken(12).length).toBe(16);
  });

  it("不重复", () => {
    expect(new Set(Array.from({ length: 200 }, () => randomToken())).size).toBe(200);
  });
});

describe("base64UrlEncode", () => {
  it("把标准 base64 的 + / 换成 - _ 并去掉填充", () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 190]))).toBe("-_--");
    expect(base64UrlEncode(new Uint8Array([1]))).toBe("AQ");
  });
});
