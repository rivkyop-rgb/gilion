import { expect, test } from "@playwright/test";

import { NEWSPAPERS, USERS, login } from "./helpers";

/**
 * "+ הוספת סינון" on the orders and publications lists, and the arrow that
 * opens a row's details (26/09/2026). The URL is the state: each chip is a
 * parameter, and removing it removes the parameter.
 */
test.describe("filtering and expanding the lists", () => {
  test("publications: two filters stack, are named, and come off one at a time", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await page.goto("/publications");

    await page.getByTestId("filter-builder-add").click();
    await page.getByTestId("filter-builder-field").selectOption("newspaper");
    await page.getByTestId("filter-builder-value").selectOption(NEWSPAPERS.alpha);
    await page.getByTestId("filter-builder-apply").click();
    await page.waitForURL(/newspaper=/);

    await page.getByTestId("filter-builder-add").click();
    await page.getByTestId("filter-builder-field").selectOption("payment");
    await page.getByTestId("filter-builder-value").selectOption("unpaid");
    await page.getByTestId("filter-builder-apply").click();
    await page.waitForURL(/payment=unpaid/);
    expect(page.url()).toContain("newspaper=");

    await expect(page.getByTestId("filter-chip-newspaper")).toBeVisible();
    await expect(page.getByTestId("attention-banner")).toContainText('בתשלום "לא שולם"');

    await page.getByTestId("filter-remove-payment").click();
    await page.waitForURL((url) => !url.search.includes("payment="));
    await expect(page.getByTestId("filter-chip-newspaper")).toBeVisible();
  });

  test("the arrow opens a publication's details under its row", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/publications");
    const expand = page.locator('[data-testid^="expand-publication-row-"]').first();
    await expand.click();
    await expect(page.locator('[data-testid^="details-publication-row-"]').first()).toContainText(
      "בהזמנה",
    );
  });

  test("the arrow on an order lists its lines", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/orders?status=approved");
    await page.locator('[data-testid^="expand-order-row-"]').first().click();
    await expect(page.locator('[data-testid^="order-lines-"]').first()).toBeVisible();
  });
});
