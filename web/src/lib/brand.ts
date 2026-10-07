/**
 * 产品名：默认 MailEdge。别的部署在 index.html 的 <meta name="application-name"> 里写自己的名字
 * （独立版给网鱼用时由服务端换成「网鱼邮箱」），侧栏、登录页、标签页标题都跟着它走。
 */
export const DEFAULT_BRAND_NAME = "MailEdge";

export function brandNameFrom(content: string | null | undefined): string {
  const name = content?.replace(/\s+/g, " ").trim();
  return name ? name.slice(0, 40) : DEFAULT_BRAND_NAME;
}

let cached: string | undefined;

interface MetaReader {
  querySelector(selector: string): { getAttribute(name: string): string | null } | null;
}

export function brandName(): string {
  if (cached === undefined) {
    // 不直接写 document：这个文件也给测试（workerd 里没有 DOM）用
    const doc = (globalThis as { document?: MetaReader }).document;
    cached = brandNameFrom(doc?.querySelector('meta[name="application-name"]')?.getAttribute("content"));
  }
  return cached;
}

/** 换过名字的部署（不是 MailEdge 本身）：关于页要写明「基于 MailEdge」。 */
export function isCustomBrand(): boolean {
  return brandName() !== DEFAULT_BRAND_NAME;
}

const CJK = /[⺀-鿿豈-﫿＀-￯]/u;

/**
 * 把文案里的 {brand} 换成产品名。中文挨着中文时去掉中间的空格：
 * 「使用你的 {brand} 账户登录」→「使用你的网鱼邮箱账户登录」，换成 MailEdge 时空格照留。
 */
export function fillBrand(template: string, brand: string): string {
  if (!template.includes("{brand}")) return template;
  const first = brand.charAt(0);
  const last = brand.charAt(brand.length - 1);
  return template.replace(
    /(\S?)( ?)\{brand\}( ?)(\S?)/gu,
    (_match, before: string, left: string, right: string, after: string) => {
      const keepLeft = left && !(CJK.test(before) && CJK.test(first)) ? " " : "";
      const keepRight = right && !(CJK.test(after) && CJK.test(last)) ? " " : "";
      return `${before}${keepLeft}${brand}${keepRight}${after}`;
    },
  );
}
