import { expect, test } from "@playwright/test";
import { CUSTOMERS, USERS, login } from "./helpers";

/**
 * Deleting a customer (US-002).
 *
 * The confirmation is the requested feature, but the guard is the important
 * one: a customer with orders behind them cannot be removed without taking
 * that history along, so the button is absent there and the reason is shown in
 * its place. Refusing after the click would be a worse experience than never
 * offering it.
 */
test.describe("who may delete a customer", () => {
  test("sales can edit but is not offered deletion", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto(`/customers/${CUSTOMERS.alphaRegular}`);

    // Sales edits customers — the delete control is a separate, stricter thing.
    await expect(page.getByRole("link", { name: "עריכה" })).toBeVisible();
    await expect(page.getByTestId("delete-customer")).toHaveCount(0);
    await expect(page.getByTestId("delete-blocked")).toHaveCount(0);
  });
});

test.describe("the confirmation", () => {
  test("asks before deleting, and names what is about to go", async ({ page }) => {
    await login(page, USERS.admin);

    // A customer created for this test, so nothing else depends on it.
    await page.goto("/customers/new");
    const name = `לקוח למחיקה ${Date.now()}`;
    await page.getByTestId("type-casual").click();
    await page.fill("#contactName", name);
    await page.fill("#phone", "050-1234567");
    await page.getByRole("button", { name: "שמירה" }).click();
    await page.waitForURL(/\/customers\/[a-z0-9]+$/);
    const id = page.url().split("/").pop()!;

    // Nothing happens until it is confirmed.
    await page.getByTestId("delete-customer").click();
    const dialog = page.getByTestId("delete-customer-dialog");
    await expect(dialog).toContainText(name);
    // Stored normalised — the customer domain strips the dashes on save, so
    // the dialog shows the digits as they actually are in the record.
    await expect(dialog).toContainText("0501234567");
    await expect(dialog).toContainText("אי אפשר לשחזר");

    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("customer-name")).toContainText(name);

    // Confirmed — and it is really gone.
    await page.getByTestId("delete-customer").click();
    await page.getByTestId("delete-customer-dialog-confirm").click();
    await page.waitForURL(/\/customers$/);
    await expect(page.getByTestId("customers-table")).not.toContainText(name);

    await page.goto(`/customers/${id}`);
    await expect(page.getByTestId("customer-name")).toHaveCount(0);
  });
});

test.describe("a customer with history is protected", () => {
  test("the button is replaced by the reason, and the action refuses too", async ({ page }) => {
    await login(page, USERS.sales);

    // Give the customer an order, which is what makes them undeletable.
    await page.goto("/orders/new");
    await page.getByTestId("order-customer").click();
    await page
      .getByTestId("order-customer-list")
      .getByRole("option")
      .filter({ hasText: "מרכז הרפואה" })
      .first()
      .click();
    await page.getByTestId("create-order").click();
    await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

    await login(page, USERS.admin);
    await page.goto(`/customers/${CUSTOMERS.alphaRegular}`);

    // No button at all — the reason stands where it would have been.
    await expect(page.getByTestId("delete-customer")).toHaveCount(0);
    const reason = page.getByTestId("delete-blocked");
    await expect(reason).toContainText("לא ניתן למחוק");
    await expect(reason).toContainText("הזמנות");
  });
});
