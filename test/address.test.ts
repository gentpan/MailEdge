import { describe, expect, it } from "vitest";
import { assertValidEmail, isValidEmail, isValidHeaderName } from "../src/mail/address";

describe("isValidEmail — 正常地址", () => {
  it.each([
    "a@b.com",
    "user.name@example.com",
    "user+tag@example.co.uk",
    "user_name-1@sub.example.com",
    "USER@EXAMPLE.COM",
    "x@xn--fiqs8s.com",
  ])("接受 %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });
});

describe("isValidEmail — 头注入向量", () => {
  it.each([
    ["CRLF 注入 Bcc", "victim@x.com\r\nBcc: mass@list.com"],
    ["裸 LF", "victim@x.com\nBcc: mass@list.com"],
    ["裸 CR", "victim@x.com\rX-Evil: 1"],
    ["NUL 截断", "victim@x.com\x00@evil.com"],
    ["制表符", "victim@x.com\tevil"],
    ["零宽字符", "victim​@x.com"],
    ["空格", "victim @x.com"],
  ])("拒绝 %s", (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("isValidEmail — 格式错误", () => {
  it.each([
    ["空串", ""],
    ["没有 @", "abc"],
    ["没有域名", "a@"],
    ["没有 local", "@b.com"],
    ["域名无点", "a@localhost"],
    ["域名以点开头", "a@.com"],
    ["域名以连字符开头", "a@-x.com"],
    ["域名以连字符结尾", "a@x-.com"],
    ["尖括号", "<a@b.com>"],
    ["逗号", "a,b@x.com"],
    ["分号", "a;b@x.com"],
    ["超长", `${"a".repeat(250)}@x.com`],
  ])("拒绝 %s", (_label, email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("assertValidEmail", () => {
  it("合法地址原样返回", () => {
    expect(assertValidEmail("a@b.com")).toBe("a@b.com");
  });

  it("报错信息带上字段名，便于用户定位", () => {
    expect(() => assertValidEmail("bad", "收件地址")).toThrow(/收件地址不合法/);
  });

  it("回显时剔除控制字符，避免把 CRLF 带进日志", () => {
    let message = "";
    try {
      assertValidEmail("a@b.com\r\nBcc: x@y.com");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("\r");
    expect(message).not.toContain("\n");
  });

  it("超长地址在回显时被截断", () => {
    let message = "";
    try {
      assertValidEmail(`${"a".repeat(500)}@x.com`);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message.length).toBeLessThan(120);
  });
});

describe("isValidHeaderName", () => {
  it("接受常规字段名", () => {
    expect(isValidHeaderName("X-Custom-Header")).toBe(true);
    expect(isValidHeaderName("List-Unsubscribe")).toBe(true);
  });

  it("拒绝含 CRLF 的字段名（否则可伪造新头部）", () => {
    expect(isValidHeaderName("X-A\r\nBcc")).toBe(false);
    expect(isValidHeaderName("X-A\nBcc")).toBe(false);
  });

  it("拒绝含冒号与空格的字段名", () => {
    expect(isValidHeaderName("X-A: b")).toBe(false);
    expect(isValidHeaderName("X A")).toBe(false);
  });

  it("拒绝空字段名", () => {
    expect(isValidHeaderName("")).toBe(false);
  });
});
