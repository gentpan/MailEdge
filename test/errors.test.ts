import { describe, expect, it } from "vitest";
import { classifyHttpFailure, classifyMessage, classifyThrown, errorMessage } from "../src/mail/errors";

/**
 * 这组测试守的是「同一封被拒的邮件不会在多个渠道各发一次」。
 * 判成 transient 就会切备用渠道重发，所以宁可误判 permanent，不可误判 transient。
 */
describe("classifyHttpFailure", () => {
  it.each([408, 425, 429, 500, 502, 503, 504])("HTTP %i 是临时故障，可切渠道", (status) => {
    expect(classifyHttpFailure(status, "")).toBe("transient");
  });

  it.each([
    [400, "invalid email address"],
    [401, "unauthorized"],
    [403, "domain is not verified"],
    [404, "not found"],
    [413, "message exceeds size limit"],
    [422, "from address unverified"],
  ])("HTTP %i「%s」是永久失败，绝不重发", (status, message) => {
    expect(classifyHttpFailure(status, message)).toBe("permanent");
  });

  it("4xx 但报文明确说临时问题时仍算临时", () => {
    expect(classifyHttpFailure(400, "rate limit exceeded, try again later")).toBe("transient");
    expect(classifyHttpFailure(403, "service temporarily unavailable")).toBe("transient");
  });

  it("2xx/3xx 落到临时分支（调用方本不该传成功码）", () => {
    expect(classifyHttpFailure(200, "")).toBe("transient");
  });
});

describe("classifyThrown", () => {
  it.each([
    "Domain example.com is not verified",
    "invalid recipient",
    "Account suspended",
    "message rejected as spam",
    "destination address not allowed",
    "域名 example.com 未验证",
  ])("「%s」判为永久失败", (message) => {
    expect(classifyThrown(new Error(message))).toBe("permanent");
  });

  it.each([
    "fetch failed",
    "network error",
    "connection reset by peer",
    "socket hang up",
    "Request timed out",
  ])("「%s」判为临时故障", (message) => {
    expect(classifyThrown(new Error(message))).toBe("transient");
  });

  it("非 Error 抛出物也能分类", () => {
    expect(classifyThrown("domain not verified")).toBe("permanent");
    expect(classifyThrown({ weird: true })).toBe("transient");
  });

  it("未知错误默认临时（可重试），符合网络层兜底", () => {
    expect(classifyThrown(new Error("something odd"))).toBe("transient");
  });
});

describe("classifyMessage", () => {
  it("永久优先于临时：同时命中两类时判永久，避免重发被拒邮件", () => {
    expect(classifyMessage("rejected: please try again")).toBe("permanent");
  });

  it("都不命中时用调用方给的兜底值", () => {
    expect(classifyMessage("mystery", "permanent")).toBe("permanent");
    expect(classifyMessage("mystery", "transient")).toBe("transient");
    expect(classifyMessage("mystery")).toBe("transient");
  });
});

describe("errorMessage", () => {
  it("取 Error.message", () => {
    expect(errorMessage(new Error("炸了"))).toBe("炸了");
  });

  it("空 message 的 Error 用兜底文案", () => {
    expect(errorMessage(new Error(""))).toBe("发送失败");
  });

  it("字符串原样返回，其他类型用兜底", () => {
    expect(errorMessage("出错了")).toBe("出错了");
    expect(errorMessage(null)).toBe("发送失败");
    expect(errorMessage(undefined, "自定义兜底")).toBe("自定义兜底");
  });
});
