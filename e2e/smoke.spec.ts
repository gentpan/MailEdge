import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("health endpoint reports a usable Worker", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();

  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok).toBe(true);
});

test("authentication shell renders without browser errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page).toHaveTitle(/MailEdge/);
  await expect(page.locator("form.auth__card")).toBeVisible();
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("authentication shell has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("form.auth__card")).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );

  expect(blockingViolations).toEqual([]);
});
