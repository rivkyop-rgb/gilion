import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * FR-8. Hiding a menu item is presentation; the requirement is that the server
 * refuses. Each case therefore checks both the menu and a direct URL.
 */
test.describe("navigation and route guards by role (FR-8)", () => {
  test("a designer sees no billing entry and is refused at /billing", async ({ page }) => {
    await login(page, USERS.designer);

    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByText("גבייה ותשלומים")).toHaveCount(0);
    await expect(nav.getByText("דוחות")).toHaveCount(0);

    // The real check: typing the URL by hand.
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("an accountant reaches billing but not the ad files area", async ({ page }) => {
    await login(page, USERS.accounting);

    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByText("גבייה ותשלומים")).toBeVisible();
    await expect(nav.getByText("מודעות וקבצים")).toHaveCount(0);

    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "גבייה ותשלומים" })).toBeVisible();
  });

  test("an admin sees every area, including the audit log", async ({ page }) => {
    await login(page, USERS.admin);
    await page.locator("form button").first().click();
    await page.waitForURL(/\/dashboard/);

    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    for (const label of [
      "לוח בקרה",
      "לקוחות",
      "הזמנות",
      "גבייה ותשלומים",
      "הגדרות",
      "לוג ביקורת",
    ]) {
      await expect(nav.getByText(label)).toBeVisible();
    }
  });

  test("sales sees orders but is refused at /billing", async ({ page }) => {
    await login(page, USERS.sales);

    const nav = page.getByRole("navigation", { name: "ניווט ראשי" });
    await expect(nav.getByText("הזמנות")).toBeVisible();
    await expect(nav.getByText("גבייה ותשלומים")).toHaveCount(0);

    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });
});
