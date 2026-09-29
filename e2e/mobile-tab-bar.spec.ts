import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";

/**
 * The phone's bottom bar (redesign, 29/09/2026). It adds a way around a small
 * screen and follows the same permission matrix as the sidebar.
 */
test.describe("the bottom bar on a phone", () => {
  test("appears on a phone, and the gold + opens a new order", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);
    await page.goto("/dashboard");

    const bar = page.getByTestId("mobile-tab-bar");
    await expect(bar).toBeVisible();
    await bar.getByRole("link", { name: "הזמנה חדשה" }).click();
    await page.waitForURL(/\/orders\/new/);
  });

  test("is not there on a desktop, where the sidebar is", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("mobile-tab-bar")).toBeHidden();
  });

  test("a designer gets no new-order button and no billing (FR-8)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, USERS.designer);
    await page.goto("/dashboard");

    const bar = page.getByTestId("mobile-tab-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: "הזמנה חדשה" })).toHaveCount(0);
    await expect(bar.getByRole("link", { name: "גבייה" })).toHaveCount(0);
  });
});
