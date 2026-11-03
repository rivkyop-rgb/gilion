import { expect, test } from "@playwright/test";

import { CUSTOMERS, USERS, login, loginAsAdmin, saveCustomer } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * Round two of 03/11/2026: the board suggests a spot and places it in one
 * click, every ad opens to its details, help is one button away, a new order
 * line starts on the inner pages, and a customer can be kept out of
 * automatic placement.
 */

test.describe("the board suggests where an ad goes", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("picking an ad marks a suggested spot, and one click places it there", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);

    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    const bar = page.getByTestId("suggestion-bar");
    await expect(bar).toContainText("מקום מוצע");
    // The board does not jump by itself; "הצגה" opens the suggested page,
    // with the spot marked on it.
    await bar.getByRole("button", { name: "הצגה" }).click();
    await expect(page.locator('[data-testid^="suggested-spot-"]')).toHaveCount(1);

    await page.getByTestId("suggest-place").click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
  });

  test("the arrow opens the order's details, with the order linked", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await page.getByTestId(`candidate-expand-${ISSUE_FIXTURES.quarterA}`).click();
    const details = page.getByTestId(`candidate-details-${ISSUE_FIXTURES.quarterA}`);
    await expect(details).toContainText("ORD-");
    await expect(details).toContainText("מיקום");
    await expect(details.getByTestId(`candidate-file-${ISSUE_FIXTURES.quarterA}`)).toBeVisible();
  });
});

test("help: the button starts a tour of this screen, and links the guide", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/customers");
  await page.getByTestId("help-button").click();
  await page.getByTestId("help-start-tour").click();
  const tour = page.getByTestId("guided-tour");
  await expect(tour).toContainText("לקוח חדש");
  await page.getByTestId("tour-next").click();
  await expect(tour).toContainText("ייבוא מאקסל");
  // Through to the end — "סיום" closes it.
  for (let i = 0; i < 5 && (await tour.count()) > 0; i++) {
    await page.getByTestId("tour-next").click();
  }
  await expect(tour).toHaveCount(0);

  await page.getByTestId("help-button").click();
  await page.getByRole("link", { name: "מדריך שימוש" }).click();
  await expect(page).toHaveURL(/\/help#customers$/);
  await expect(page.getByTestId("help-board")).toContainText("לשבץ כאן");
});

test("a new order line starts on the inner pages", async ({ page }) => {
  await login(page, USERS.sales);
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  await expect(page.locator("#pageTypeId option:checked")).toHaveText("פנימי");
});

test("a customer can be kept out of automatic placement", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/customers/${CUSTOMERS.alphaCasual}/edit`);
  const box = page.getByTestId("customer-no-auto-place").locator("input");
  await box.check();
  await saveCustomer(page);
  await expect(page).toHaveURL(new RegExp(`/customers/${CUSTOMERS.alphaCasual}$`));

  await page.goto(`/customers/${CUSTOMERS.alphaCasual}/edit`);
  await expect(page.getByTestId("customer-no-auto-place").locator("input")).toBeChecked();
  // Put back — the fixture customer is shared.
  await page.getByTestId("customer-no-auto-place").locator("input").uncheck();
  await saveCustomer(page);
});
