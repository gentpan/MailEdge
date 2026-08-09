const EMAIL_CANVAS_MARKER = "data-mailedge-email-canvas";
const EMAIL_FLUID_WIDTH_MARKER = "data-mailedge-fluid-width";
const EMAIL_RESPONSIVE_CSS = `body{max-width:100%;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:720px){table{max-width:100%!important;min-width:0!important}table[${EMAIL_FLUID_WIDTH_MARKER}]{width:100%!important}td[${EMAIL_FLUID_WIDTH_MARKER}],th[${EMAIL_FLUID_WIDTH_MARKER}],col[${EMAIL_FLUID_WIDTH_MARKER}]{width:auto!important;min-width:0!important}img,video,canvas,svg{max-width:100%!important;height:auto!important}}`;

export type EmailColorMode = "light" | "dark";
type AuthorDarkCanvas = "none" | "responsive" | "fixed";

// 大部分 HTML 邮件按白色画布编写，且大量颜色来自 inline style，普通的 CSS
// 深色覆盖无法可靠改写。深色模式因此对完整邮件画布做颜色映射，再对媒体元素
// 做一次反向映射。若邮件已经提供原生 dark media query，则在该查询生效时关闭
// 整体反色，避免原生深色样式被二次转换回浅色。
function emailCanvasHead(mode: EmailColorMode, authorDark: AuthorDarkCanvas): string {
  if (mode === "dark") {
    const authorOverride =
      authorDark === "fixed"
        ? "body{filter:none}img,video,canvas,svg{filter:none}"
        : authorDark === "responsive"
          ? "@media(prefers-color-scheme:dark){body{background:#0f1115;color:#f4f6fa;filter:none}img,video,canvas,svg{filter:none}}"
          : "";
    return `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style ${EMAIL_CANVAS_MARKER}="dark">:root{color-scheme:dark}html,body{margin:0}html{background:#0f1115}body{background:#fff;color:#111827;filter:invert(1) hue-rotate(180deg);transform-origin:top left}img,video,canvas,svg{filter:invert(1) hue-rotate(180deg)}${EMAIL_RESPONSIVE_CSS}${authorOverride}</style>`;
  }

  return `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style ${EMAIL_CANVAS_MARKER}="light">:root{color-scheme:only light}html,body{margin:0;background:#fff}body{color:#111827}${EMAIL_RESPONSIVE_CSS}</style>`;
}

/**
 * 为不完整或透明背景的 HTML 邮件补充独立阅读画布。
 *
 * 邮件仍在 sandbox iframe 内渲染；这里只添加显示层兜底，不改写邮件原有内容。
 */
export function prepareEmailHtml(html: string, mode: EmailColorMode = "light"): string {
  if (html.includes(`${EMAIL_CANVAS_MARKER}="${mode}"`)) return html;

  const canvasHead = emailCanvasHead(mode, hasAuthorDarkCanvas(html));
  const responsiveHtml = markLegacyFixedWidths(html);

  const headPattern = /<head(?:\s[^>]*)?>/i;
  if (headPattern.test(responsiveHtml)) {
    return responsiveHtml.replace(headPattern, (head) => `${head}${canvasHead}`);
  }

  const htmlPattern = /<html(?:\s[^>]*)?>/i;
  if (htmlPattern.test(responsiveHtml)) {
    return responsiveHtml.replace(htmlPattern, (root) => `${root}<head>${canvasHead}</head>`);
  }

  if (/<body(?:\s[^>]*)?>/i.test(responsiveHtml)) {
    return `<!doctype html><html><head>${canvasHead}</head>${responsiveHtml}</html>`;
  }

  return `<!doctype html><html><head>${canvasHead}</head><body>${responsiveHtml}</body></html>`;
}

function markLegacyFixedWidths(html: string): string {
  return html.replace(/<(table|td|th|col)\b([^>]*)>/gi, (tag, element: string, attributes: string) => {
    if (attributes.includes(EMAIL_FLUID_WIDTH_MARKER)) return tag;

    const width = readAttribute(attributes, "width");
    const style = readAttribute(attributes, "style");
    if (!isFixedWidthAttribute(width) && !hasFixedWidthDeclaration(style)) return tag;

    const selfClosing = /\/\s*$/.test(attributes);
    const cleanAttributes = selfClosing ? attributes.replace(/\/\s*$/, "") : attributes;
    return `<${element}${cleanAttributes} ${EMAIL_FLUID_WIDTH_MARKER}${selfClosing ? " /" : ""}>`;
  });
}

function readAttribute(attributes: string, name: string): string | undefined {
  const quoted = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  if (quoted) return quoted[2]?.trim();

  return attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*([^\\s>]+)`, "i"))?.[1]?.trim();
}

function isFixedWidthAttribute(value: string | undefined): boolean {
  if (!value || value.endsWith("%")) return false;
  return /^(?:\d+(?:\.\d+)?)(?:px)?$/i.test(value);
}

function hasFixedWidthDeclaration(style: string | undefined): boolean {
  if (!style) return false;

  return ["width", "min-width"].some((property) => {
    const value = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"))?.[1]?.trim();
    return value ? /^(?:\d+(?:\.\d+)?)(?:px|pt|pc|in|cm|mm)(?:\s*!important)?$/i.test(value) : false;
  });
}

function hasAuthorDarkCanvas(html: string): AuthorDarkCanvas {
  if (/@media[^{]*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i.test(html)) return "responsive";

  // Some transactional clients intentionally ship a permanently dark canvas
  // without a media query. Applying MailEdge's fallback inversion to those
  // documents turns their black background white and corrupts brand colors.
  // Treat an explicit dark-only color-scheme declaration as authoritative.
  const hasFixedDarkMeta = (html.match(/<meta\b[^>]*>/gi) ?? []).some(
    (tag) =>
      /\bname\s*=\s*["']color-scheme["']/i.test(tag) && /\bcontent\s*=\s*["']\s*dark\s*["']/i.test(tag),
  );
  return hasFixedDarkMeta ? "fixed" : "none";
}
