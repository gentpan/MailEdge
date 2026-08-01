import { describe, expect, it } from "vitest";
import { escapeHtml, markdownToEmailHtml } from "../src/shared/markdown";

describe("escapeHtml", () => {
  it('转义 & < > "', () => {
    expect(escapeHtml('<script>&"')).toBe("&lt;script&gt;&amp;&quot;");
  });

  it("先转 & 再转其他，不产生双重转义", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("XSS 防护", () => {
  it("用户写的 HTML 被转义而不是执行", () => {
    const html = markdownToEmailHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("img onerror 之类的属性注入被转义", () => {
    const html = markdownToEmailHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="alert');
  });

  it("javascript: 链接降级为纯文字，且不回显地址", () => {
    const html = markdownToEmailHtml("[点我](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("点我");
    expect(html).not.toContain("<a href");
  });

  it("data: 链接同样降级", () => {
    const html = markdownToEmailHtml("[看图](data:text/html;base64,PHNjcmlwdD4=)");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("看图");
  });

  it("大小写混写的 JaVaScRiPt: 也拦得住", () => {
    const html = markdownToEmailHtml("[x](JaVaScRiPt:alert(1))");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("代码块内容被转义", () => {
    const html = markdownToEmailHtml("```\n<script>alert(1)</script>\n```");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("链接文字里的引号不会撑破 href 属性", () => {
    const html = markdownToEmailHtml('[a](https://x.com/") onmouseover="alert(1))');
    expect(html).not.toContain('onmouseover="alert');
  });
});

describe("块级语法", () => {
  it("一到三级标题", () => {
    const html = markdownToEmailHtml("# 一级\n## 二级\n### 三级");
    expect(html).toMatch(/<h1 style="[^"]*">一级<\/h1>/);
    expect(html).toMatch(/<h2 style="[^"]*">二级<\/h2>/);
    expect(html).toMatch(/<h3 style="[^"]*">三级<\/h3>/);
  });

  it("四级及以上不当标题处理", () => {
    expect(markdownToEmailHtml("#### 四级")).not.toContain("<h4");
  });

  it("空行分段", () => {
    const html = markdownToEmailHtml("第一段\n\n第二段");
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it("同段内换行转 <br>", () => {
    expect(markdownToEmailHtml("上\n下")).toContain("上<br>下");
  });

  it("无序列表", () => {
    const html = markdownToEmailHtml("- 甲\n- 乙");
    expect(html).toContain("<ul");
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain("</ul>");
  });

  it("有序列表", () => {
    const html = markdownToEmailHtml("1. 甲\n2. 乙");
    expect(html).toContain("<ol");
    expect(html).toContain("</ol>");
  });

  it("无序切到有序时正确闭合", () => {
    const html = markdownToEmailHtml("- 甲\n\n1. 乙");
    expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("<ol"));
  });

  it("引用块", () => {
    expect(markdownToEmailHtml("> 引用内容")).toContain("<blockquote");
  });

  it("分割线", () => {
    expect(markdownToEmailHtml("---")).toContain("<hr");
    expect(markdownToEmailHtml("***")).toContain("<hr");
  });

  it("代码块用 <pre>，首行语言标识不进正文", () => {
    const html = markdownToEmailHtml("```js\nconst a = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("const a = 1;");
    expect(html).not.toContain("js\n");
  });
});

describe("行内语法", () => {
  it("加粗与斜体", () => {
    expect(markdownToEmailHtml("**粗**")).toContain("<strong");
    expect(markdownToEmailHtml("这是 *斜* 体")).toContain("<em>斜</em>");
  });

  it("行内代码", () => {
    expect(markdownToEmailHtml("用 `npm run dev` 启动")).toContain("<code");
  });

  it("行内代码里的星号不被当成加粗", () => {
    const html = markdownToEmailHtml("`**不是加粗**`");
    expect(html).not.toContain("<strong");
  });

  it("http(s) 链接正常生成 <a>", () => {
    expect(markdownToEmailHtml("[官网](https://example.com)")).toContain('<a href="https://example.com"');
  });

  it("mailto 链接允许", () => {
    expect(markdownToEmailHtml("[联系](mailto:a@x.com)")).toContain('<a href="mailto:a@x.com"');
  });

  it("裸链接自动转成 <a>", () => {
    expect(markdownToEmailHtml("见 https://example.com/x")).toContain('<a href="https://example.com/x"');
  });

  it("地址里的成对括号不被截断", () => {
    const html = markdownToEmailHtml("[条目](https://x.com/a_(b))");
    expect(html).toContain('href="https://x.com/a_(b)"');
  });
});

describe("邮件客户端兼容", () => {
  it("全部样式内联，不产生 <style> 或 class", () => {
    const html = markdownToEmailHtml("# 标题\n\n正文 **粗** 和 `代码`\n\n- 列表");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
    expect(html).toContain('style="');
  });

  it("外层是带基础字体样式的 div", () => {
    expect(markdownToEmailHtml("x")).toMatch(/^<div style="font-family:/);
  });

  it("空输入产出合法空文档", () => {
    expect(markdownToEmailHtml("")).toBe(markdownToEmailHtml("").trim());
    expect(markdownToEmailHtml("")).toContain("<div");
  });
});
