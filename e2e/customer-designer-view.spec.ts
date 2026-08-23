import { expect, test } from "@playwright/test";
import { CUSTOMERS, USERS, login } from "./helpers";

/**
 * FR-8: a designer needs to know whose ad they are placing, but must never see
 * the customer's financial position — not in a column, not on the card.
 */
test.describe("what a designer sees of a customer (FR-8)", () => {
  test("reads the list but gets no debt column and no create button", async ({ page }) => {
    await login(page, USERS.designer);
    await page.goto("/customers");

    // Row counts drift as other specs create customers, so assert on the
    // seeded names and on what must be absent — never on a total.
    await expect(page.getByText("מרכז הרפואה")).toBeVisible();
    await expect(page.getByTestId("debt-header")).toHaveCount(0);
    await expect(page.getByTestId("new-customer")).toHaveCount(0);
  });

  test("opens a customer card without any money on it", async ({ page }) => {
    await login(page, USERS.designer);
    await page.goto(`/customers/${CUSTOMERS.alphaRegular}`);

    await expect(page.getByTestId("customer-name")).toBeVisible();
    await expect(page.getByTestId("customer-debt")).toHaveCount(0);
    // No editing affordances either.
    await expect(page.getByTestId("open-convert")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "עריכה" })).toHaveCount(0);
  });

  test("is refused at the create and edit routes, not merely unlinked", async ({ page }) => {
    await login(page, USERS.designer);

    await page.goto("/customers/new");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();

    await page.goto(`/customers/${CUSTOMERS.alphaRegular}/edit`);
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("an accountant reads customers but cannot create them", async ({ page }) => {
    await login(page, USERS.accounting);
    await page.goto("/customers");

    await expect(page.getByText("מרכז הרפואה")).toBeVisible();
    // accounting has read access, so money is visible to them
    await expect(page.getByTestId("debt-header")).toHaveCount(1);
    await expect(page.getByTestId("new-customer")).toHaveCount(0);

    await page.goto("/customers/new");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });
});
