import { describe, expect, it } from "vitest";
import { prepareEmailHtml } from "../web/src/lib/emailHtml";

describe("prepareEmailHtml", () => {
  it("为 HTML 片段补充浅色阅读画布", () => {
    const result = prepareEmailHtml('<div style="color:#202124">邮件正文</div>');

    expect(result).toContain("<!doctype html>");
    expect(result).toContain("data-mailedge-email-canvas");
    expect(result).toContain("html,body{margin:0;background:#fff}");
    expect(result).toContain('<div style="color:#202124">邮件正文</div>');
  });

  it("把兜底样式放在邮件自有样式之前", () => {
    const customStyle = "<style>body{background:#101318;color:#f8fafc}</style>";
    const result = prepareEmailHtml(`<html><head>${customStyle}</head><body>深色邮件</body></html>`);

    expect(result.indexOf("data-mailedge-email-canvas")).toBeLessThan(result.indexOf(customStyle));
  });

  it("支持只有 body 的文档", () => {
    const result = prepareEmailHtml('<body style="background:#fff">正文</body>');

    expect(result).toMatch(/^<!doctype html><html><head>/);
    expect(result).toContain('<body style="background:#fff">正文</body>');
    expect(result).toMatch(/<\/html>$/);
  });

  it("窄视口下收缩固定宽度表格和媒体而不产生正文横向滚动", () => {
    const result = prepareEmailHtml(
      '<table style="min-width:620px"><tr><td>很长的表格内容</td></tr></table><img width="900" src="banner.png">',
    );

    expect(result).toContain("@media(max-width:720px){table{max-width:100%!important;min-width:0!important}");
    expect(result).toContain('<table style="min-width:620px" data-mailedge-fluid-width>');
    expect(result).toContain("img,video,canvas,svg{max-width:100%!important;height:auto!important}");
    expect(result).toContain("body{max-width:100%;overflow-wrap:anywhere}");
  });

  it("只在窄视口流体化 Outlook 固定宽度的嵌套表格和列", () => {
    const result = prepareEmailHtml(`
      <table role="presentation" width="100%">
        <tr><td align="center">
          <table role="presentation" width="640" style="width: 640px; max-width: 100%">
            <tr><td width="320" style="width:320px">左栏</td><td width="50%">右栏</td></tr>
          </table>
        </td></tr>
      </table>
    `);

    expect(result).toContain(
      '<table role="presentation" width="640" style="width: 640px; max-width: 100%" data-mailedge-fluid-width>',
    );
    expect(result).toContain('<td width="320" style="width:320px" data-mailedge-fluid-width>左栏</td>');
    expect(result).toContain('<table role="presentation" width="100%">');
    expect(result).toContain('<td width="50%">右栏</td>');
    expect(result).toContain("table[data-mailedge-fluid-width]{width:100%!important}");
    expect(result).toContain(
      "td[data-mailedge-fluid-width],th[data-mailedge-fluid-width],col[data-mailedge-fluid-width]{width:auto!important;min-width:0!important}",
    );
  });

  it("不标记百分比与自动宽度，保留作者的响应式布局", () => {
    const result = prepareEmailHtml(
      '<table width="100%" style="width:100%;max-width:680px" data-width="640"><tr><td width="48%" style="width:auto">响应式列</td></tr></table>',
    );

    expect(result.match(/data-mailedge-fluid-width(?=>)/g)).toBeNull();
    expect(result).toContain('<table width="100%" style="width:100%;max-width:680px" data-width="640">');
    expect(result).toContain('<td width="48%" style="width:auto">响应式列</td>');
  });

  it("重复处理时不会再次注入", () => {
    const once = prepareEmailHtml("<p>正文</p>");
    const twice = prepareEmailHtml(once);

    expect(twice).toBe(once);
    expect(twice.match(/data-mailedge-email-canvas/g)).toHaveLength(1);
  });

  it("深色模式映射完整邮件画布并还原媒体颜色", () => {
    const result = prepareEmailHtml('<p>正文</p><img src="logo.png">', "dark");

    expect(result).toContain('data-mailedge-email-canvas="dark"');
    expect(result).toContain("html,body{margin:0}");
    expect(result).toContain("body{background:#fff;color:#111827;filter:invert(1) hue-rotate(180deg)");
    expect(result).toContain("img,video,canvas,svg{filter:invert(1) hue-rotate(180deg)}");
    expect(result).toContain('<img src="logo.png">');
  });

  it("相同正文可以分别生成浅色与深色画布", () => {
    const light = prepareEmailHtml("<p>正文</p>", "light");
    const dark = prepareEmailHtml("<p>正文</p>", "dark");

    expect(light).toContain('data-mailedge-email-canvas="light"');
    expect(dark).toContain('data-mailedge-email-canvas="dark"');
    expect(dark).not.toBe(light);
  });

  it("原生 dark media query 生效时关闭整体反色", () => {
    const html =
      "<html><head><style>@media (prefers-color-scheme: dark){body{background:#000;color:#fff}}</style></head><body>原生深色邮件</body></html>";
    const result = prepareEmailHtml(html, "dark");

    expect(result).toContain(
      "@media(prefers-color-scheme:dark){body{background:#0f1115;color:#f4f6fa;filter:none}",
    );
    expect(result).toContain("@media (prefers-color-scheme: dark){body{background:#000;color:#fff}}");
  });

  it("固定 dark 画布不会被二次反色", () => {
    const html =
      '<html><head><meta name="color-scheme" content="dark"><style>body{background:#050506;color:#f7f7f8}</style></head><body>固定深色邮件</body></html>';
    const result = prepareEmailHtml(html, "dark");

    expect(result).toContain("body{filter:none}img,video,canvas,svg{filter:none}");
    expect(result).toContain("body{background:#050506;color:#f7f7f8}");
  });

  it("固定 dark 声明允许 content 属性写在 name 前面", () => {
    const html =
      '<html><head><meta content="dark" name="color-scheme"></head><body style="background:#000;color:#fff">固定深色邮件</body></html>';
    const result = prepareEmailHtml(html, "dark");

    expect(result).toContain("body{filter:none}img,video,canvas,svg{filter:none}");
  });

  it("light dark 声明本身不跳过深色兜底", () => {
    const html =
      '<html><head><meta name="color-scheme" content="light dark"></head><body style="background:#fff;color:#111">普通邮件</body></html>';
    const result = prepareEmailHtml(html, "dark");

    expect(result).toContain("body{background:#fff;color:#111827;filter:invert(1) hue-rotate(180deg)");
    expect(result).not.toContain(
      "@media(prefers-color-scheme:dark){body{background:#0f1115;color:#f4f6fa;filter:none}",
    );
  });
});
