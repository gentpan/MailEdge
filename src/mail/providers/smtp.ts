import { connect } from "cloudflare:sockets";
import { bytesToBase64 } from "../../lib/crypto";
import { classifyMessage, classifyThrown, errorMessage } from "../errors";
import { buildMimeMessage } from "../mime";
import type { MailProvider, SendMailInput, SendMailResult } from "../types";

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  security: "tls" | "starttls";
}

/**
 * 通用 SMTP 代发。用 Workers 的 connect() 建原始 TCP，走 587 STARTTLS 或 465 TLS，
 * 手写一段 SMTP 会话（EHLO → [STARTTLS] → AUTH LOGIN → MAIL/RCPT/DATA → QUIT）。
 *
 * 注意：Workers 禁止 25 端口出站，所以只能用 465/587——发信本来也不该用 25。
 * 用外部邮箱（如 Gmail）代发时：host=smtp.gmail.com、port=587、security=starttls、
 * username=完整邮箱、password=应用专用密码（需先开两步验证）。
 */
export class SmtpMailProvider implements MailProvider {
  readonly type = "smtp" as const;

  constructor(
    private readonly config: SmtpConfig,
    private readonly internalId: string,
  ) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    let session: SmtpSession | null = null;
    try {
      const recipients = [
        ...input.to,
        ...(input.cc ?? []),
        ...(input.bcc ?? []),
      ].map((item) => item.email);
      const unique = [...new Set(recipients)];
      if (!unique.length) throw new SmtpError("invalid recipient：收件人为空", "permanent");

      const raw = buildMimeMessage(input, { internalId: this.internalId });

      session = await SmtpSession.open(this.config);
      await session.handshakeAndAuth();
      await session.sendMail(input.from.email, unique, raw);
      await session.quit();

      return { provider: this.type, success: true, providerMessageId: this.internalId };
    } catch (error) {
      const kind = error instanceof SmtpError ? error.kind : classifyThrown(error);
      return { provider: this.type, success: false, error: errorMessage(error), failureKind: kind };
    } finally {
      await session?.close();
    }
  }
}

class SmtpError extends Error {
  constructor(
    message: string,
    readonly kind: "transient" | "permanent",
  ) {
    super(message);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 一条 SMTP 回复的末行：「三位数字 + 空格 + 内容 + CRLF」；续行是「数字-」不匹配
const FINAL_LINE = /(?:^|\r\n)\d{3} [^\r\n]*\r\n/;

class SmtpSession {
  private constructor(
    private socket: Socket,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly config: SmtpConfig,
    private buffer = "",
  ) {}

  static async open(config: SmtpConfig): Promise<SmtpSession> {
    const socket = connect(
      { hostname: config.host, port: config.port },
      { secureTransport: config.security === "tls" ? "on" : "starttls", allowHalfOpen: false },
    );
    const session = new SmtpSession(
      socket,
      socket.writable.getWriter(),
      socket.readable.getReader(),
      config,
    );
    await session.expect(220); // 服务端问候
    return session;
  }

  async handshakeAndAuth(): Promise<void> {
    const domain = this.config.username.split("@")[1] ?? "mailedge";
    await this.command(`EHLO ${domain}`, 250);

    if (this.config.security === "starttls") {
      await this.command("STARTTLS", 220);
      // 升级为 TLS 后，读写流全部换成新 socket 的
      this.reader.releaseLock();
      this.writer.releaseLock();
      this.socket = this.socket.startTls();
      this.writer = this.socket.writable.getWriter();
      this.reader = this.socket.readable.getReader();
      this.buffer = "";
      await this.command(`EHLO ${domain}`, 250);
    }

    // AUTH LOGIN：分两步分别送 base64 的用户名与密码
    await this.command("AUTH LOGIN", 334);
    await this.command(base64(this.config.username), 334);
    await this.command(base64(this.config.password), 235);
  }

  async sendMail(from: string, recipients: string[], raw: string): Promise<void> {
    await this.command(`MAIL FROM:<${from}>`, 250);
    for (const rcpt of recipients) {
      await this.command(`RCPT TO:<${rcpt}>`, 250);
    }
    await this.command("DATA", 354);
    await this.write(`${dotStuff(raw)}\r\n.\r\n`);
    await this.expect(250);
  }

  async quit(): Promise<void> {
    await this.write("QUIT\r\n");
    // 有些服务端会直接断开，QUIT 的 221 回复读不到也无妨
    await this.expect(221).catch(() => undefined);
  }

  async close(): Promise<void> {
    try {
      this.writer.releaseLock();
      this.reader.releaseLock();
      await this.socket.close();
    } catch {
      // 已关闭，忽略
    }
  }

  private async command(line: string, expected: number): Promise<string> {
    await this.write(`${line}\r\n`);
    return this.expect(expected);
  }

  private async write(data: string): Promise<void> {
    await this.writer.write(encoder.encode(data));
  }

  /** 读取一条完整 SMTP 回复（含多行 250- 续行），校验状态码 */
  private async expect(expected: number): Promise<string> {
    const reply = await this.readReply();
    const code = Number(reply.slice(0, 3));
    if (code !== expected) {
      // 4xx 临时、5xx 永久；据此决定上层是否切换备用渠道
      const kind = code >= 500 ? "permanent" : code >= 400 ? "transient" : classifyMessage(reply, "permanent");
      throw new SmtpError(`SMTP ${code}：${reply.trim()}`, kind);
    }
    return reply;
  }

  private async readReply(): Promise<string> {
    // 一条回复可能多行：末行是「三位数字 + 空格」，续行是「三位数字 + 连字符」。
    // 关键：末行必须以 CRLF 结束才算完整，否则分片到达的半行会被误判为结束。
    while (true) {
      const match = FINAL_LINE.exec(this.buffer);
      if (match) {
        const endIdx = match.index + match[0].length;
        const reply = this.buffer.slice(0, endIdx).replace(/\r\n$/, "");
        this.buffer = this.buffer.slice(endIdx);
        return reply;
      }
      const { value, done } = await this.reader.read();
      if (done) {
        if (this.buffer) {
          const rest = this.buffer;
          this.buffer = "";
          return rest;
        }
        throw new SmtpError("连接被服务器关闭", "transient");
      }
      this.buffer += decoder.decode(value, { stream: true });
    }
  }
}

/** DATA 阶段：以点开头的行前面再加一个点，避免被当成报文结束符 */
function dotStuff(message: string): string {
  return message.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
}

function base64(value: string): string {
  return bytesToBase64(encoder.encode(value));
}
