/**
 * Markdown → 邮件安全 HTML。
 *
 * 邮件客户端的限制和网页完全不同：<style> 标签会被剥掉、class 无效、
 * flex/grid 在 Outlook 里不工作。所以这里直接输出内联样式的 HTML，
 * 不做二次处理。前端预览与实际发送共用本函数，所见即所发。
 *
 * 输入一律先转义，用户写的原始 HTML 不会被执行。
 */

import { escapeHtml } from "./text";

// 占位符使用 Unicode 私用区，避免正文里出现同形文本被误替换
const BLOCK_MARK = "";
const CODE_MARK = "";
const END_MARK = "";

const S = {
  root: "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.6;color:#111827;",
  p: "margin:0 0 12px;",
  h1: "margin:0 0 12px;font-size:24px;font-weight:600;line-height:1.25;",
  h2: "margin:20px 0 12px;font-size:20px;font-weight:600;line-height:1.25;",
  h3: "margin:16px 0 8px;font-size:16px;font-weight:600;line-height:1.25;",
  ul: "margin:0 0 12px;padding-left:24px;",
  ol: "margin:0 0 12px;padding-left:24px;",
  li: "margin-bottom:4px;",
  quote: "margin:0 0 12px;padding:4px 0 4px 12px;border-left:3px solid #e5e7eb;color:#6b7280;",
  pre: "margin:0 0 12px;padding:12px;background:#f8f9fa;border-radius:6px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;",
  code: "padding:2px 5px;background:#f3f4f6;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;",
  a: "color:#0052d9;text-decoration:underline;",
  hr: "border:none;border-top:1px solid #e5e7eb;margin:20px 0;",
  strong: "font-weight:600;",
};

export function markdownToEmailHtml(markdown: string): string {
  const source = markdown.replace(/\r\n/g, "\n");

  // 代码块先抽出来占位，内部不参与后续的行内解析
  const blocks: string[] = [];
  const withoutBlocks = source.replace(/```([\s\S]*?)```/g, (_match, code: string) => {
    const body = String(code)
      .replace(/^[^\n]*\n/, "")
      .replace(/\n$/, "");
    blocks.push('<pre style="' + S.pre + '">' + escapeHtml(body) + "</pre>");
    return "\n" + BLOCK_MARK + (blocks.length - 1) + END_MARK + "\n";
  });

  const lines = withoutBlocks.split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push('<p style="' + S.p + '">' + inline(paragraph.join("<br>")) + "</p>");
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) return;
    out.push("</" + listType + ">");
    listType = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push('<blockquote style="' + S.quote + '">' + inline(quote.join("<br>")) + "</blockquote>");
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    const placeholder = new RegExp("^" + BLOCK_MARK + "(\\d+)" + END_MARK + "$").exec(trimmed);
    if (placeholder) {
      flushAll();
      out.push(blocks[Number(placeholder[1])] ?? "");
      continue;
    }

    if (!trimmed) {
      flushAll();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushAll();
      out.push('<hr style="' + S.hr + '">');
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1]!.length as 1 | 2 | 3;
      const style = level === 1 ? S.h1 : level === 2 ? S.h2 : S.h3;
      out.push(
        "<h" + level + ' style="' + style + '">' + inline(escapeHtml(heading[2] ?? "")) + "</h" + level + ">",
      );
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(escapeHtml(quoted[1] ?? ""));
      continue;
    }
    flushQuote();

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const wanted = bullet ? "ul" : "ol";
      if (listType !== wanted) {
        flushList();
        listType = wanted;
        out.push("<" + wanted + ' style="' + (wanted === "ul" ? S.ul : S.ol) + '">');
      }
      const text = (bullet ?? numbered)![1] ?? "";
      out.push('<li style="' + S.li + '">' + inline(escapeHtml(text)) + "</li>");
      continue;
    }
    flushList();

    paragraph.push(escapeHtml(line));
  }

  flushAll();
  return '<div style="' + S.root + '">' + out.join("") + "</div>";
}

/** 行内语法。传入的文本必须已经过 HTML 转义。 */
function inline(text: string): string {
  const codes: string[] = [];

  let result = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push('<code style="' + S.code + '">' + code + "</code>");
    return CODE_MARK + (codes.length - 1) + END_MARK;
  });

  // [文字](地址)
  // 地址允许含一层成对括号，避免 foo(1) 这类地址被截断后留下残余右括号
  result = result.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()]*\))+)\)/g, (_m, label: string, href: string) =>
    // 非 http(s)/mailto 的链接一律降级为纯文字，且不回显地址，避免诱导手动访问
    isSafeUrl(href) ? '<a href="' + href + '" style="' + S.a + '">' + label + "</a>" : label,
  );

  // 裸链接（前面已被转成 <a> 的不会再匹配，因为紧邻字符是引号）
  result = result.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_m, prefix: string, url: string) => prefix + '<a href="' + url + '" style="' + S.a + '">' + url + "</a>",
  );

  result = result
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="' + S.strong + '">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return result.replace(
    new RegExp(CODE_MARK + "(\\d+)" + END_MARK, "g"),
    (_m, index: string) => codes[Number(index)] ?? "",
  );
}

function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url);
}

// 与 shared/text.ts 共用同一份转义，保持 re-export 兼容既有调用方
export { escapeHtml } from "./text";
