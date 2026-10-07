import { describe, expect, it } from "vitest";
import { brandNameFrom, DEFAULT_BRAND_NAME, fillBrand } from "../web/src/lib/brand";

describe("产品名", () => {
  it("没写或写空用 MailEdge，多余空白合并", () => {
    expect(brandNameFrom(null)).toBe(DEFAULT_BRAND_NAME);
    expect(brandNameFrom("   ")).toBe(DEFAULT_BRAND_NAME);
    expect(brandNameFrom("  网鱼\n邮箱 ")).toBe("网鱼 邮箱");
    expect(brandNameFrom("网鱼邮箱")).toBe("网鱼邮箱");
  });

  it("中文挨着中文去掉空格，换成英文名字时空格照留", () => {
    expect(fillBrand("使用你的 {brand} 账户登录。", "网鱼邮箱")).toBe("使用你的网鱼邮箱账户登录。");
    expect(fillBrand("使用你的 {brand} 账户登录。", "MailEdge")).toBe("使用你的 MailEdge 账户登录。");
    expect(fillBrand("Sign in with your {brand} account.", "网鱼邮箱")).toBe(
      "Sign in with your 网鱼邮箱 account.",
    );
    expect(fillBrand("默认显示名，如「{brand} 客服」", "网鱼邮箱")).toBe("默认显示名，如「网鱼邮箱客服」");
    expect(fillBrand("默认显示名，如「{brand} 客服」", "MailEdge")).toBe("默认显示名，如「MailEdge 客服」");
    expect(fillBrand("{brand} 的版权", "网鱼邮箱")).toBe("网鱼邮箱的版权");
    expect(fillBrand("{brand}", "网鱼邮箱")).toBe("网鱼邮箱");
    expect(fillBrand("没有名字的文案", "网鱼邮箱")).toBe("没有名字的文案");
  });
});
