import { describe, expect, it } from "vitest";
import { buildMimeMessage, formatAddress } from "../src/mail/mime";
import type { SendMailInput } from "../src/mail/types";

const AT = new Date(Date.UTC(2026, 6, 15, 9, 30, 0));

function build(overrides: Partial<SendMailInput> = {}): string {
  const input: SendMailInput = {
    from: { email: "me@example.com" },
    to: [{ email: "you@example.com" }],
    subject: "Hello",
    text: "hi",
    ...overrides,
  };
  return buildMimeMessage(input, { internalId: "mail_01TEST", date: AT });
}

/** 取报文头部（第一个空行之前） */
function headersOf(raw: string): string {
  return raw.split("\r\n\r\n")[0] ?? "";
}

describe("基本头部", () => {
  it("Message-ID 用内部 ID + 发件域", () => {
    expect(build()).toContain("Message-ID: <mail_01TEST@example.com>");
  });

  it("带出 X-App-Message-ID 供跨渠道去重", () => {
    expect(build()).toContain("X-App-Message-ID: mail_01TEST");
  });

  it("Date 是 RFC 5322 格式的 UTC", () => {
    expect(build()).toContain("Date: Wed, 15 Jul 2026 09:30:00 +0000");
  });

  it("多个收件人用逗号连接", () => {
    const raw = build({ to: [{ email: "a@x.com" }, { email: "b@x.com", name: "B" }] });
    expect(raw).toContain("To: a@x.com, B <b@x.com>");
  });
});

describe("密送隐私", () => {
  it("Bcc 绝不写进报文（投递由信封收件人负责）", () => {
    const raw = build({ bcc: [{ email: "secret@spy.com" }], cc: [{ email: "open@x.com" }] });
    expect(raw).toContain("Cc: open@x.com");
    expect(raw).not.toContain("secret@spy.com");
    expect(raw.toLowerCase()).not.toContain("bcc:");
  });
});

describe("头部编码", () => {
  it("中文主题按 RFC 2047 编码", () => {
    const raw = build({ subject: "季度报告" });
    expect(raw).toMatch(/Subject: =\?utf-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(raw).not.toContain("季度报告");
  });

  it("纯 ASCII 主题保持原样", () => {
    expect(build({ subject: "Quarterly report" })).toContain("Subject: Quarterly report");
  });

  it("显示名含特殊字符时加引号", () => {
    expect(formatAddress({ email: "a@x.com", name: "Doe, John" })).toBe('"Doe, John" <a@x.com>');
  });

  it("显示名无特殊字符时不加引号", () => {
    expect(formatAddress({ email: "a@x.com", name: "John" })).toBe("John <a@x.com>");
  });

  it("非 ASCII 显示名走 RFC 2047", () => {
    expect(formatAddress({ email: "a@x.com", name: "张三" })).toMatch(/^=\?utf-8\?B\?.+\?= <a@x\.com>$/);
  });
});

describe("头注入防护", () => {
  it("主题里的 CRLF 不会伪造出新头部", () => {
    const raw = build({ subject: "正常\r\nBcc: attacker@evil.com" });
    expect(headersOf(raw)).not.toMatch(/^Bcc:/m);
    expect(raw).not.toContain("attacker@evil.com");
  });

  it("收件地址含 CRLF 时直接拒绝，而不是拼进报文", () => {
    expect(() => build({ to: [{ email: "victim@x.com\r\nBcc: mass@list.com" }] })).toThrow(/地址/);
  });

  it("发件地址含 CRLF 时直接拒绝", () => {
    expect(() => build({ from: { email: "me@x.com\r\nX-Evil: 1" } })).toThrow(/地址/);
  });

  it("Reply-To 含 CRLF 时直接拒绝", () => {
    expect(() => build({ replyTo: { email: "a@x.com\nCc: leak@x.com" } })).toThrow(/地址/);
  });

  it("显示名里的 CRLF 被编码，不产生新头部", () => {
    const raw = build({ to: [{ email: "a@x.com", name: "正常\r\nBcc: evil@x.com" }] });
    expect(headersOf(raw)).not.toMatch(/^Bcc:/m);
  });

  it("自定义头的值含 CRLF 时被编码", () => {
    const raw = build({ headers: { "X-Note": "a\r\nX-Injected: 1" } });
    expect(headersOf(raw)).not.toMatch(/^X-Injected:/m);
  });

  it("自定义头的字段名含 CRLF 时整条丢弃（字段名不经编码）", () => {
    const raw = build({ headers: { "X-A\r\nBcc": "evil@x.com" } });
    expect(headersOf(raw)).not.toMatch(/^Bcc:/m);
    expect(raw).not.toContain("evil@x.com");
  });

  it("密送地址含 CRLF 时同样被拒（虽不进报文，但会进 SMTP 的 RCPT TO）", () => {
    expect(() => build({ bcc: [{ email: "a@x.com\r\nRCPT TO:<mass@list.com>" }] })).toThrow(/地址/);
  });

  it("抄送地址含 CRLF 时被拒", () => {
    expect(() => build({ cc: [{ email: "a@x.com\r\nBcc: leak@x.com" }] })).toThrow(/地址/);
  });

  it("自定义头不能覆盖保留头", () => {
    const raw = build({ headers: { Subject: "伪造", From: "spoof@evil.com", "Message-ID": "<fake>" } });
    expect(raw).toContain("Subject: Hello");
    expect(raw).not.toContain("spoof@evil.com");
    expect(raw).not.toContain("<fake>");
  });

  it("保留头判断不区分大小写", () => {
    const raw = build({ headers: { SUBJECT: "伪造", "message-id": "<fake>" } });
    expect(raw).toContain("Subject: Hello");
    expect(raw).not.toContain("<fake>");
  });

  it("附件文件名里的 CRLF 被剥离，不会注入新头部", () => {
    const raw = build({
      attachments: [
        {
          filename: "a.txt\r\nBcc: evil@x.com",
          contentType: "text/plain",
          content: new Uint8Array([1]).buffer,
        },
      ],
    });
    expect(headersOf(raw)).not.toMatch(/^Bcc:/m);
    expect(raw).not.toContain("\r\nBcc:");
  });

  it("附件 content-type 里的 CRLF 被剥离，不会注入新头部", () => {
    const raw = build({
      attachments: [
        {
          filename: "a.txt",
          contentType: "text/plain\r\nBcc: evil@x.com",
          content: new Uint8Array([1]).buffer,
        },
      ],
    });
    expect(headersOf(raw)).not.toMatch(/^Bcc:/m);
    expect(raw).not.toContain("\r\nBcc:");
  });
});

describe("正文结构", () => {
  it("同时有 text 与 html 时用 multipart/alternative", () => {
    const raw = build({ text: "纯文本", html: "<p>富文本</p>" });
    expect(raw).toContain("Content-Type: multipart/alternative");
    expect(raw).toContain('Content-Type: text/plain; charset="utf-8"');
    expect(raw).toContain('Content-Type: text/html; charset="utf-8"');
  });

  it("只有 html 时不套 multipart", () => {
    const raw = build({ text: undefined, html: "<p>x</p>" });
    expect(raw).not.toContain("multipart");
    expect(raw).toContain('Content-Type: text/html; charset="utf-8"');
  });

  it("正文用 base64 且按 76 列折行", () => {
    const raw = build({ text: "x".repeat(500), html: undefined });
    const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    for (const line of body.split("\r\n").filter(Boolean)) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  it("有附件时用 multipart/mixed", () => {
    const raw = build({
      attachments: [
        { filename: "报告.pdf", contentType: "application/pdf", content: new Uint8Array([1, 2, 3]).buffer },
      ],
    });
    expect(raw).toContain("Content-Type: multipart/mixed");
    expect(raw).toContain('Content-Disposition: attachment; filename="报告.pdf"');
  });

  it("内联附件（有 contentId）用 multipart/related 并标 inline", () => {
    const raw = build({
      html: "<img src='cid:logo'>",
      attachments: [
        {
          filename: "logo.png",
          contentType: "image/png",
          contentId: "logo",
          content: new Uint8Array([1]).buffer,
        },
      ],
    });
    expect(raw).toContain("Content-Type: multipart/related");
    expect(raw).toContain("Content-ID: <logo>");
    expect(raw).toContain("Content-Disposition: inline");
  });

  it("附件文件名里的引号被转义", () => {
    const raw = build({
      attachments: [{ filename: 'a"b.txt', contentType: "text/plain", content: new Uint8Array([1]).buffer }],
    });
    expect(raw).toContain('filename="a\\"b.txt"');
  });

  it("multipart 的 boundary 每封都不同", () => {
    const boundaryOf = (raw: string) => /boundary="([^"]+)"/.exec(raw)?.[1];
    const a = build({ text: "a", html: "<p>a</p>" });
    const b = build({ text: "a", html: "<p>a</p>" });
    expect(boundaryOf(a)).not.toBe(boundaryOf(b));
  });
});
