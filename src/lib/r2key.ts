/**
 * R2 键的统一构造。
 *
 * 结构：{用途}/{信箱}/{年月}/{标识}/{文件}
 *
 * 分层的实际收益：
 *   1. R2 生命周期规则按前缀配置，分了年月就能交给 R2 自动清理旧对象
 *   2. list() 按前缀扫描，扁平结构下列举某个月要扫全量
 *   3. 按信箱前缀可直接统计各信箱占用的存储
 *
 * 完整键都落库（DO 的 r2_key、attachment_links.r2_key、outbound_messages.payload_key），
 * 所以调整这里只影响新对象，存量对象照常可读，不需要迁移。
 */

/**
 * 文件名清洗。
 *
 * R2 键支持 UTF-8，而且键从不直接进 URL（下载走 token），
 * 所以保留中文等非 ASCII 字符——否则「设计稿.zip」会变成「_.zip」，
 * 排查问题时完全看不出是什么文件。只剔除控制字符和会影响键层级、
 * URL 解析的字符。
 */
export function safeName(filename: string, maxLength = 100): string {
  const cleaned = filename
    .replace(/\p{C}/gu, "")
    .replace(/[/\\?#[\]%"'<>|:*]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+/, "");

  // 按字符切，避免把多字节字符从中间截断
  const trimmed = [...(cleaned || "file")].slice(0, maxLength).join("");
  return trimmed || "file";
}

/** 归档分区，形如 2026-07 */
export function partition(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const r2Key = {
  /** 收到的附件 */
  inboundAttachment(
    mailboxId: string,
    messageId: string,
    index: number,
    filename: string,
    at?: Date,
  ): string {
    return `inbound/${mailboxId}/${partition(at)}/${messageId}/${index}-${safeName(filename)}`;
  },

  /** 收到的原始报文，留档备查 */
  inboundRaw(mailboxId: string, messageId: string, at?: Date): string {
    return `inbound/${mailboxId}/${partition(at)}/${messageId}/raw.eml`;
  },

  /** 待发送载荷所在目录，重试时从这里取回 */
  outboundDir(mailboxId: string, internalId: string, at?: Date): string {
    return `outbound/${mailboxId}/${partition(at)}/${internalId}`;
  },

  /** 智能附件生成的下载分享 */
  share(mailboxId: string, token: string, filename: string, at?: Date): string {
    return `shares/${mailboxId}/${partition(at)}/${token}/${safeName(filename, 120)}`;
  },
};

/** 从完整键推出它所在的目录前缀，用于批量清理 */
export function dirPrefix(key: string): string {
  const index = key.lastIndexOf("/");
  return index === -1 ? key : `${key.slice(0, index)}/`;
}
