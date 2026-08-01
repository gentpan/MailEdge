/**
 * wrangler.jsonc 的解析与定点改写。
 *
 * 单独成文件是为了能被测试覆盖：这里全是正则，而配置文件里同时存在
 * 注释和含「//」的 URL，稍不留神就会把 "https://..." 的一半当成注释吃掉。
 * 本文件不依赖任何 node: 模块，保持纯函数。
 */

/**
 * 从命令输出里抠出 JSON。
 * wrangler 会在 JSON 前后混进版本号横幅和提示，不能直接 JSON.parse。
 */
export function extractJson(text) {
  if (!text) return null;

  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const closing = text[start] === "[" ? "]" : "}";
  const end = text.lastIndexOf(closing);
  if (end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * 解析 JSONC。
 *
 * 关键在于交替式匹配：把「完整字符串」放在注释模式前面，
 * 于是 "https://a.com" 会先作为字符串整体匹配掉，其中的 // 不会被误认为注释。
 */
export function parseJsonc(raw) {
  const stripped = raw
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) =>
      match.startsWith('"') ? match : "",
    )
    // 去掉注释后可能留下尾逗号
    .replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(stripped);
}

/**
 * 替换某个键的字符串值，保留注释与排版。
 * 找不到该键时返回 null，由调用方决定如何报错。
 */
export function replaceStringValue(raw, key, value) {
  const pattern = new RegExp(`("${escapeRegExp(key)}"\\s*:\\s*)"[^"]*"`);
  if (!pattern.test(raw)) return null;

  // 用函数式替换，避免 value 里的 $& 等被当成替换模式
  return raw.replace(pattern, (_match, prefix) => `${prefix}"${value}"`);
}

/** 从 wrangler deploy 的输出里找出可访问的地址 */
export function extractDeployedUrl(text) {
  const match = /https:\/\/[^\s"']*\.workers\.dev[^\s"']*/.exec(text ?? "");
  return match ? match[0].replace(/[).,]+$/, "") : null;
}

/** whoami 未登录时退出码仍是 0，只能靠输出判断 */
export function isUnauthenticated(output) {
  return /not authenticated|Please run .?wrangler login/i.test(output ?? "");
}

/** 从 whoami 的表格里取账号名与 ID */
export function parseAccount(output) {
  const match = /│\s*(.+?)\s*│\s*([0-9a-f]{32})\s*│/.exec(output ?? "");
  return match ? { name: match[1], id: match[2] } : null;
}

/**
 * 桶名是否已存在。
 * 用边界匹配，避免 mailedge 命中 mailedge-attachments 这种前缀包含。
 */
export function hasBucket(listOutput, name) {
  return new RegExp(`(^|\\s|")${escapeRegExp(name)}(\\s|"|$)`, "m").test(listOutput ?? "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
