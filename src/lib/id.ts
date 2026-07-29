const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** ULID：48 bit 时间戳 + 80 bit 随机，按时间单调递增，可直接做主键排序。 */
export function ulid(now = Date.now()): string {
  let time = now;
  const chars: string[] = new Array(26);

  for (let i = 9; i >= 0; i--) {
    chars[i] = CROCKFORD[time % 32]!;
    time = Math.floor(time / 32);
  }

  const random = crypto.getRandomValues(new Uint8Array(16));
  for (let i = 10; i < 26; i++) {
    chars[i] = CROCKFORD[random[i - 10]! % 32]!;
  }

  return chars.join("");
}

/**
 * 内部邮件 ID。切换 Provider 时沿用同一个 ID，
 * 以 X-App-Message-ID 头带出，便于去重与全链路追踪。
 */
export function newMessageId(): string {
  return `mail_${ulid()}`;
}

export function newId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}

/** URL 安全的随机 token（附件下载、会话） */
export function randomToken(bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlEncode(buffer);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
