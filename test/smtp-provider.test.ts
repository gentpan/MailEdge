import { describe, expect, it } from "vitest";
import { smtpEhloDomain } from "../src/mail/providers/smtp";

describe("smtpEhloDomain", () => {
  it("裸用户名（自建中继常见）用发件人域名做 EHLO，避免非 FQDN 被拒", () => {
    expect(smtpEhloDomain({ host: "mail.example.com" }, "alice@example.com")).toBe("example.com");
  });

  it("username 带域名（Gmail 代发）时仍以发件人域名为准", () => {
    expect(smtpEhloDomain({ host: "smtp.gmail.com" }, "alice@gmail.com")).toBe("gmail.com");
  });

  it("发件人地址无域名时兜底服务器主机名", () => {
    expect(smtpEhloDomain({ host: "mail.example.com" }, "alice")).toBe("mail.example.com");
  });

  it("发件人与主机名都异常时兜底 localhost", () => {
    expect(smtpEhloDomain({ host: "" }, "alice")).toBe("localhost");
  });
});
