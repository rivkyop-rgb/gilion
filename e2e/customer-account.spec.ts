import { expect, test, type Page } from "@playwright/test";

import { USERS, login, loginAsAdmin, addOrderLine } from "./helpers";
import { validPng } from "./ad-fixtures";
import { uploadFile } from "./ad-helpers";

/**
 * The customer card as a place you can actually answer questions from
 * (US-002, US-010): what did they order, what is still open, and which files
 * of theirs do we hold.
 */

/**
 * A customer of this test's own, because the balance is a SUM.
 *
 * Asserting a total on a seeded customer means asserting on every order every
 * other spec happened to open for them — the number is correct and the test is
 * still wrong. global-setup removes customers with generated ids, so one per
 * run accumulates nothing.
 */
async function ownCustomer(page: Page): Promise<{ id: string; name: string }> {
  const name = `לקוח חשבון ${Date.now()}`;
  await page.goto("/customers/new");
  await page.getByTestId("type-casual").click();
  await page.fill("#contactName", name);
  await page.fill("#phone", "050-7654321");
  await page.getByRole("button", { name: "שמירה" }).click();
  // The id pattern has to exclude "new": /customers/new matches a bare
  // [a-z0-9]+ too, so a wait that permits it can return before the navigation
  // and hand back "new" as the customer id.
  await page.waitForURL(/\/customers\/c[a-z0-9]{20,}$/);
  return { id: page.url().split("/").pop()!, name };
}

async function approvedOrderFor(page: Page, customerLabel: string, price: string) {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page
    .getByTestId("order-customer-list")
    .getByRole("option")
    .filter({ hasText: customerLabel })
    .first()
    .click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  await addOrderLine(page, "2026-12-01", price, 1);

  await page.getByTestId("submit-order").click();
  await page.getByTestId("approve-order").click();
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
}

test("כרטיס הלקוח מציג הזמנות, יתרה, פרסומים וקבצים", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await ownCustomer(page);
  await approvedOrderFor(page, customer.name, "1500");

  await page.goto("/advertisements");
  const file = await validPng(`for-customer-${Date.now()}.png`);
  await uploadFile(page, file, { customerId: customer.id });

  await page.goto(`/customers/${customer.id}`);

  // Orders, with the money on them.
  const orders = page.getByTestId("customer-orders");
  await expect(orders).toBeVisible();
  await expect(orders).toContainText("1,500");
  await expect(orders).toContainText("לא שולם");

  // The balance. Until stage 08 this screen carried a caveat saying the
  // numbers came from how each order was MARKED, because there was no Payment
  // entity to ask; it now says where they actually come from, and nothing was
  // paid on this order.
  await expect(page.getByTestId("account-billed")).toContainText("1,500");
  await expect(page.getByTestId("account-settled")).toContainText("0");
  await expect(page.getByTestId("account-outstanding")).toContainText("1,500");
  await expect(page.getByTestId("account-source")).toContainText("רישומי התשלום בפועל");

  // No payment was recorded, so the section says so rather than showing a table.
  await expect(page.getByTestId("customer-payments-section")).toContainText("עוד לא נרשם תשלום");

  // Publications, and which of them are still missing artwork.
  await expect(page.getByTestId("customer-publications")).toContainText("חסר קובץ");

  // The customer's files.
  await expect(page.getByTestId("customer-ads")).toContainText(file.name);
});

test("גרפיקאית רואה את הלקוח ואת הקבצים, ולא רואה כסף (FR-8)", async ({ page }) => {
  test.slow();
  // Real data first, as admin: with an empty customer every table is an empty
  // state and the test would pass without proving anything about the role.
  await loginAsAdmin(page);
  const customer = await ownCustomer(page);
  await approvedOrderFor(page, customer.name, "700");

  await login(page, USERS.designer);
  await page.goto(`/customers/${customer.id}`);

  await expect(page.getByTestId("customer-name")).toBeVisible();
  // Publications are the designer's job; the balance is not their business.
  await expect(page.getByTestId("customer-publications")).toBeVisible();
  await expect(page.getByTestId("customer-account")).toHaveCount(0);
  await expect(page.getByTestId("customer-debt")).toHaveCount(0);
  await expect(page.getByTestId("customer-orders")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("700");
});

test("מנהלת חשבונות רואה את הכסף ולא את הקבצים (FR-8)", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await ownCustomer(page);
  await approvedOrderFor(page, customer.name, "700");

  await login(page, USERS.accounting);
  await page.goto(`/customers/${customer.id}`);

  await expect(page.getByTestId("customer-account")).toBeVisible();
  await expect(page.getByTestId("customer-orders")).toContainText("700");
  // accounting has no access to artwork anywhere, this screen included.
  await expect(page.getByTestId("customer-ads")).toHaveCount(0);
});
