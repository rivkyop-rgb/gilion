import { expect, test } from "@playwright/test";
import { CUSTOMERS, USERS, login } from "./helpers";

/**
 * The isolation check repeated for the entity this stage adds — as
 * docs/plan/01-auth-multitenancy.md requires of every stage that adds one.
 */
test.describe("customer tenant isolation (FR-1)", () => {
  test("the list shows only this business's customers", async ({ page }) => {
    await login(page, USERS.betaAdmin);
    await page.goto("/customers");

    await expect(page.getByText("צפון תיירות")).toBeVisible();
    // Nothing from the other tenant, no matter how many customers it has.
    await expect(page.getByText("מרכז הרפואה")).toHaveCount(0);
    await expect(page.getByText("אולמי הדר")).toHaveCount(0);
  });

  test("another business's customer is not reachable by URL — 404, not 403", async ({ page }) => {
    await login(page, USERS.betaAdmin);
    const res = await page.goto(`/customers/${CUSTOMERS.alphaRegular}`);

    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "לא מצאנו את מה שחיפשת" })).toBeVisible();
  });

  test("its edit form is unreachable too", async ({ page }) => {
    await login(page, USERS.betaAdmin);
    const res = await page.goto(`/customers/${CUSTOMERS.alphaRegular}/edit`);
    expect(res?.status()).toBe(404);
  });

  test("search cannot be used to fish for another tenant's names", async ({ page }) => {
    await login(page, USERS.betaAdmin);
    await page.goto("/customers?q=" + encodeURIComponent("מרכז"));
    await expect(page.locator("table tbody tr")).toHaveCount(0);
  });
});
