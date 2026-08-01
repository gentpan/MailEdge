import { describe, expect, it } from "vitest";
import { escapeHtml, stripHtml } from "../src/shared/text";

describe("escapeHtml", () => {
  it("转义五个关键字符", () => {
    expect(escapeHtml(`<a href="x">' &`)).toBe("&lt;a href=&quot;x&quot;&gt;' &amp;");
  });

  it("中文与普通文本原样保留", () => {
    expect(escapeHtml("你好，世界")).toBe("你好，世界");
  });

  it("空字符串安全", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("stripHtml", () => {
  it("去掉标签取纯文本", () => {
    expect(stripHtml("<p>你好 <b>世界</b></p>")).toContain("你好");
    expect(stripHtml("<p>你好 <b>世界</b></p>")).not.toContain("<");
  });

  it("style 与 script 块整段剥离，CSS/JS 源码不混进正文", () => {
    const html = `<style>.a{color:red}</style>正文<script>alert(1)</script>结尾`;
    const text = stripHtml(html);
    expect(text).toContain("正文");
    expect(text).toContain("结尾");
    expect(text).not.toContain(".a{color:red}");
    expect(text).not.toContain("alert(1)");
  });
});
