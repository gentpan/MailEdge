import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "qa-admin@example.com";
const ADMIN_PASSWORD = "E2ePassword!2026";

// Retrying this stateful lifecycle against the same running Worker would no longer
// be a first-run setup, so keep this one scenario single-attempt and deterministic.
test.describe.configure({ mode: "serial", retries: 0 });

test("first-run setup, logout, rejected password, login, and route refresh", async ({ page }) => {
  await test.step("create the first administrator from a clean E2E database", async () => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /初始化系统|First-run setup/ })).toBeVisible();
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#name").fill("MailEdge QA");
    await page.locator("#mailbox").fill("qa-inbox@example.com");
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /创建管理员|Create admin/ }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(".sidebar")).toBeVisible();
  });

  await test.step("retain the authenticated route after a full browser refresh", async () => {
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.locator(".list-pane")).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.locator(".list-pane")).toBeVisible();
  });

  await test.step("destroy the session through the account menu", async () => {
    await page.locator("button.user-card").click();
    await page.getByRole("menuitem", { name: /退出登录|Sign out/ }).click();

    await expect(page.locator("form.auth__card")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
  });

  await test.step("reject a wrong password without creating a session", async () => {
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill("DefinitelyWrongPassword");
    await page.locator('form.auth__card button[type="submit"]').click();

    await expect(page.locator(".alert--error")).toContainText(/邮箱或密码不正确|incorrect/);
    await expect(page.locator("form.auth__card")).toBeVisible();
    await expect(page).not.toHaveURL(/\/dashboard$/);
  });

  await test.step("sign back in with the administrator credentials", async () => {
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.locator('form.auth__card button[type="submit"]').click();

    // Authentication does not discard the route the user was viewing before sign-out.
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.locator(".sidebar")).toBeVisible();
  });
});
