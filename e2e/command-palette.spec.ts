import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";

/**
 * Quick search and actions, Ctrl+K from any screen (redesign, 29/09/2026).
 *
 * Every result is a link to a screen that already exists, and the server
 * returns only what the role may read — so the two things worth pinning are
 * that it takes you there, and that it offers no act the role cannot perform.
 */
test("Ctrl+K finds a customer and opens the billing window on them", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/dashboard");

  await page.keyboard.press("Control+k");
  await page.getByTestId("command-input").fill("מרכז הרפואה");
  await expect(page.getByTestId("command-item-c-cust_alpha_1")).toBeVisible();

  await page.getByTestId("command-item-pay-cust_alpha_1").click();
  await page.waitForURL(/\/billing\/customers\/cust_alpha_1/);
  await expect(page.getByTestId("billing-open-cust_alpha_1")).toBeVisible();
});

test("the sidebar's button opens the same window, and Enter follows the highlighted row", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/dashboard");

  await page.getByTestId("open-command-palette").click();
  await page.getByTestId("command-input").fill("לקוחות");
  // The only match is the screen itself.
  await expect(page.getByTestId("command-item-nav-customers")).toBeVisible();
  await page.getByTestId("command-input").press("Enter");
  await page.waitForURL(/\/customers$/);
});

test("a designer is offered no payment and no order (FR-8)", async ({ page }) => {
  await login(page, USERS.designer);
  await page.goto("/dashboard");

  await page.keyboard.press("Control+k");
  await page.getByTestId("command-input").fill("מרכז הרפואה");
  await expect(page.getByTestId("command-item-c-cust_alpha_1")).toBeVisible();
  await expect(page.getByTestId("command-item-pay-cust_alpha_1")).toHaveCount(0);
  await expect(page.getByTestId("command-item-order-cust_alpha_1")).toHaveCount(0);
  await expect(page.getByTestId("command-item-new-order")).toHaveCount(0);
});
