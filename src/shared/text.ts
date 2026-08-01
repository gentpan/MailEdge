/**
 * 去掉 HTML 标签取纯文本。收信处理/AI 分类/摘要的正文兜底共用。
 * 先剥掉 style/script 块，避免其文本内容（比如 CSS 源码）混进正文。
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/** HTML 实体转义。邮件正文拼接、附件区、Telegram 推送共用同一份。 */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
