/**
 * 邮件地址校验。
 *
 * 这是一道安全边界，不只是格式检查：地址会被直接拼进 MIME 头
 * （`To: <地址>`）和 SMTP 命令（`RCPT TO:<地址>`）。只要地址里
 * 混进 CR/LF，攻击者就能伪造任意头部（比如塞一个 Bcc 群发），
 * 或者在 SMTP 会话里追加命令。所以入口处必须拒绝，
 * 而不是寄希望于后面某一层会转义。
 */

/** RFC 5321 的地址上限 */
const MAX_LENGTH = 254;

/**
 * 务实的地址形态校验：不追求覆盖 RFC 5322 的全部合法写法
 * （带引号的 local part、注释语法等现实中不会用），
 * 但保证不含空白、控制字符和任何会破坏头部或 SMTP 命令的字符。
 */
const ADDRESS =
  /^[^\s<>()[\],;:\\"]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > MAX_LENGTH) return false;
  // \p{C} 覆盖 CR、LF、NUL 等所有控制字符与不可见格式字符
  if (/\p{C}/u.test(email)) return false;
  return ADDRESS.test(email);
}

/** 校验失败时抛错。message 会直接展示给用户，所以要说清是哪个地址。 */
export function assertValidEmail(email: string, field = "地址"): string {
  if (!isValidEmail(email)) {
    // 回显时去掉控制字符，避免错误信息本身又把 CRLF 带进日志
    throw new Error(`${field}不合法：${email.replace(/\p{C}/gu, "␡").slice(0, 80)}`);
  }
  return email;
}

/**
 * 头部字段名校验。字段名同样会被直接拼进报文，
 * RFC 5322 只允许除冒号外的可打印 ASCII。
 */
export function isValidHeaderName(name: string): boolean {
  return /^[\x21-\x39\x3b-\x7e]+$/.test(name);
}
