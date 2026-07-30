import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
const BASE = "http://127.0.0.1:8787";
const OUT = "/private/tmp/claude-501/-Users-peter-projects-MailEdge/162c7a2c-1f21-4283-953e-30f6253cb87a/scratchpad/shot/preview";
const jar = readFileSync("/tmp/me.cookie", "utf8");
const token = jar.split("\n").find((l) => l.includes("mailedge_session")).trim().split(/\s+/).pop();
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new", args: ["--hide-scrollbars"],
  defaultViewport: { width: 900, height: 1000, deviceScaleFactor: 2 },
});
await browser.setCookie({ name: "mailedge_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => localStorage.setItem("mailedge_lang", "zh"));
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle0" });
await new Promise(r=>setTimeout(r,900));
// 展开 Sendflare
await page.evaluate(() => [...document.querySelectorAll(".provider-block__head")].find(h=>/Sendflare|SF/i.test(h.textContent))?.click());
await new Promise(r=>setTimeout(r,600));
await page.evaluate(() => { const el=[...document.querySelectorAll(".provider-block")].find(b=>/sendflare/i.test(b.textContent)); el?.scrollIntoView({block:"center"}); });
await new Promise(r=>setTimeout(r,400));
await page.screenshot({ path: `${OUT}/domains.png` });
console.log("✓ domains");
await browser.close();
