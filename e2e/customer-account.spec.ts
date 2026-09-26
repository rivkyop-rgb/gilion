import { expect, test, type Page } from "@playwright/test";

import {
  PAGE_TYPES,
  SHAPES,
  USERS,
  login,
  loginAsAdmin,
  addOrderLine,
  passOrderWarnings,
} from "./helpers";
import { validPdf, validPng } from "./ad-fixtures";
import { uploadFile } from "./ad-helpers";
import { BILLING_DATES, approvedOrder, openBillingRow, recordPayment } from "./billing-helpers";
import {
  CLOSE_DATE,
  FIXTURE,
  ISSUE_FIXTURES,
  closeIssueUrl,
  expectPlacedCount,
  openView,
  placeAt,
  resetCloseIssue,
} from "./issue-helpers";

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
  await page.fill("#businessName", name);
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

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
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
  await expect(page.getByTestId("account-upcoming")).toContainText("1,500");
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

/**
 * The five numbers the user asked to see on a customer card (16/09/2026):
 * ordered-and-unpaid · PRINTED-and-unpaid · is there a credit · total owed ·
 * how much came in.
 *
 * Driven end to end through the product, because the interesting one is the
 * gap between the first two — and only a real issue close can open it.
 */
test("חמשת המספרים בכרטיס הלקוח, וההפרש בין 'הוזמן' ל'פורסם'", async ({ page }) => {
  test.setTimeout(240_000);
  await resetCloseIssue();
  await loginAsAdmin(page);

  const customer = await ownCustomer(page);

  // One order on the close fixture's date, so it can actually be printed.
  await approvedOrder(page, customer.name, [CLOSE_DATE], "800", {
    pageTypeId: PAGE_TYPES.inner,
    shapeId: SHAPES.quarter,
  });
  // A second on a date nothing prints, so it stays owed-but-not-yet-due.
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "700");

  await page.goto(`/customers/${customer.id}`);
  // Nothing printed yet: the whole 1,500 sits in the "ordered" bucket.
  await expect(page.getByTestId("account-upcoming")).toContainText("1,500");
  await expect(page.getByTestId("account-ran")).toContainText("0");

  // Print the first one.
  await page.goto(`/issues/${ISSUE_FIXTURES.closeIssue}/board`);
  const item = page.locator("[data-testid^='unplaced-item-']").first();
  await expect(item).toBeVisible();
  const publicationId = (await item.getAttribute("data-testid"))!.replace("unplaced-item-", "");
  await page.getByTestId(`upload-for-${publicationId}`).click();
  await page
    .getByTestId("board-upload-file")
    .setInputFiles(await validPdf(`חשבון-${Date.now()}.pdf`));
  await page.getByTestId("board-upload-submit").click();
  await expect(page.getByTestId("board-upload-dialog")).toHaveCount(0);
  await openView(page, FIXTURE.spreadView);
  await placeAt(page, publicationId, FIXTURE.innerRightPage, 0, 0);
  await expectPlacedCount(page, 0);

  await page.goto(closeIssueUrl);
  await page.getByTestId("close-issue").click();
  await page.getByTestId("confirm-close-issue").click();
  await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 180_000 });

  // Pay part of it, and leave money against nothing.
  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "600" });

  await page.goto(`/customers/${customer.id}`);

  await expect(page.getByTestId("account-settled")).toContainText("600");
  await expect(page.getByTestId("account-billed")).toContainText("1,500");
  // The 600 went to the older order — the printed one — so 200 of it is still
  // owed on something that RAN, and the untouched 700 is merely ordered.
  await expect(page.getByTestId("account-ran")).toContainText("200");
  await expect(page.getByTestId("account-upcoming")).toContainText("700");
  // And the total is the two buckets together, with no credit to deduct.
  await expect(page.getByTestId("account-net")).toContainText("900");
  await expect(page.getByTestId("account-credit-tile")).toContainText("אין יתרה לזכותו");

  // And the detail under the summary.
  await expect(page.getByTestId("customer-month-detail")).toBeVisible();
});

test("יתרת זכות מקוזזת ב'סה״כ חייב' ונאמרת בנפרד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await ownCustomer(page);
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await openBillingRow(page, customer.id);
  // 800 against a 500 charge: 500 settles it, 300 has nowhere to go.
  await recordPayment(page, { amount: "800" });

  await page.goto(`/customers/${customer.id}`);
  // Nothing owed in either bucket, and 300 held against nothing.
  await expect(page.getByTestId("account-upcoming")).toContainText("0");
  await expect(page.getByTestId("account-ran")).toContainText("0");
  await expect(page.getByTestId("account-credit")).toContainText("300");
  // The credit is its own fact and is never folded into "שילם".
  await expect(page.getByTestId("account-settled")).toContainText("500");
});
