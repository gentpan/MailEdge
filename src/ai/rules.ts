import type { MailCategory } from "./types";

/**
 * 轻量、本地、零成本的邮件分类规则。
 *
 * 规则只读取发件人、主题和正文片段，不访问网络，也不会产生 AI 用量。
 * AI 启用时由上层用 AI 结果覆盖这里的结果；AI 请求失败则继续使用本地结果。
 */
const RULES: Array<{ category: Exclude<MailCategory, "other">; terms: string[] }> = [
  {
    category: "verification",
    terms: [
      "verification code",
      "verify code",
      "security code",
      "login code",
      "sign-in code",
      "one-time",
      "one time",
      "otp",
      "2fa",
      "two-factor",
      "password reset",
      "reset password",
      "验证码",
      "验证",
      "登录",
      "登陆",
      "注册",
      "密码",
      "安全码",
      "一次性",
    ],
  },
  {
    category: "important",
    terms: [
      "action required",
      "urgent",
      "critical",
      "deadline",
      "legal",
      "contract",
      "incident",
      "outage",
      "紧急",
      "重要",
      "待处理",
      "截止",
      "法律",
      "合同",
      "故障",
      "中断",
    ],
  },
  {
    category: "promotions",
    terms: [
      "unsubscribe",
      "newsletter",
      "promotional",
      "promotion",
      "marketing",
      "sale",
      "discount",
      "coupon",
      "special offer",
      "limited time",
      "促销",
      "推广",
      "优惠",
      "折扣",
      "营销",
      "订阅",
      "活动",
      "广告",
      "限时",
    ],
  },
  {
    category: "updates",
    terms: [
      "invoice",
      "receipt",
      "billing",
      "payment",
      "order",
      "shipment",
      "shipping",
      "delivery",
      "notification",
      "alert",
      "report",
      "digest",
      "statement",
      "账单",
      "发票",
      "付款",
      "订单",
      "物流",
      "配送",
      "通知",
      "报告",
      "摘要",
      "状态",
      "更新",
    ],
  },
  {
    category: "social",
    terms: [
      "comment",
      "mention",
      "reply",
      "invitation",
      "invite",
      "follow",
      "follower",
      "community",
      "forum",
      "social",
      "评论",
      "提及",
      "回复",
      "邀请",
      "关注",
      "社区",
      "论坛",
    ],
  },
];

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreTerms(value: string, terms: string[]): number {
  return terms.reduce((score, term) => score + (value.includes(term) ? 1 : 0), 0);
}

/** 返回固定分类之一；没有明显信号时归入「其他」。 */
export function classifyEmailByRules(email: { subject: string; from: string; text: string }): MailCategory {
  const subject = normalize(email.subject);
  const from = normalize(email.from);
  const text = normalize(email.text.slice(0, 4000));
  const scores = new Map<MailCategory, number>();

  for (const rule of RULES) {
    const score =
      scoreTerms(subject, rule.terms) * 3 + scoreTerms(from, rule.terms) * 2 + scoreTerms(text, rule.terms);
    scores.set(rule.category, score);
  }

  // 规则声明顺序同时作为平分时的稳定优先级，验证码优先于推广和更新。
  let best: MailCategory = "other";
  let bestScore = 0;
  for (const rule of RULES) {
    const score = scores.get(rule.category) ?? 0;
    if (score > bestScore) {
      best = rule.category;
      bestScore = score;
    }
  }
  return best;
}
