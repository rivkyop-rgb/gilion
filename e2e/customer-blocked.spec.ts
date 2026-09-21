import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * FR-9. A customer-portal account must not reach any internal screen. This
 * suite exists because exactly this leak shipped once: Auth.js's own redirectTo
 * performs a client-side navigation that skips middleware, and a customer
 * landed on the dashboard.
 */
test.describe("customer accounts are kept out of the internal app (FR-9)", () => {
  test("signing in lands on the portal, never the dashboard", async ({ page }) => {
    await login(page, USERS.customer);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("heading", { name: "הבקשות שלי" })).toBeVisible();
  });

  for (const path of ["/dashboard", "/billing", "/select-business"]) {
    test(`typing ${path} by hand does not get in`, async ({ page }) => {
      await login(page, USERS.customer);
      await page.goto(path);
      await expect(page).toHaveURL(/\/portal$/);
    });
  }

  test("no internal shell is rendered — no sidebar, no business switcher", async ({ page }) => {
    await login(page, USERS.customer);
    await expect(page.getByTestId("business-switcher")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "ניווט ראשי" })).toHaveCount(0);
  });
});
