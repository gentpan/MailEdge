import { describe, expect, it } from "vitest";
import { classifyEmailByRules } from "../src/ai/rules";

describe("local email classification", () => {
  it("recognizes verification messages without AI", () => {
    expect(
      classifyEmailByRules({
        from: "security@example.com",
        subject: "Your verification code",
        text: "Use this one-time code to sign in.",
      }),
    ).toBe("verification");
  });

  it("recognizes promotional messages", () => {
    expect(
      classifyEmailByRules({
        from: "newsletter@shop.example",
        subject: "Limited time discount",
        text: "Unsubscribe from marketing emails at any time.",
      }),
    ).toBe("promotions");
  });

  it("falls back to other when no rule matches", () => {
    expect(
      classifyEmailByRules({
        from: "person@example.com",
        subject: "A note for you",
        text: "Here is the document we discussed.",
      }),
    ).toBe("other");
  });
});
