import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import {
  BILLING_DATES,
  approvedOrder,
  createCustomer,
  openBillingRow,
  openOrderBalances,
  recordPayment,
} from "./billing-helpers";

/**
 * The billing panel, by MONTH.
 *
 * Raised by the user: opening a customer showed what was owed broken down by
 * `ORD-3K1VBH`, which is an internal id nobody rings a customer about. What a
 * person says is "you still owe for March and April", so that is what the panel
 * has to lead with.
 */

test("הפאנל פותח בפירוט חודשי, מהחודש הישן לחדש", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח פירוט חודשי");
  // Three insertions of 1,000: two in March, one in April.
  await approvedOrder(
    page,
    customer.name,
    [BILLING_DATES.march[0], BILLING_DATES.march[1], BILLING_DATES.april],
    "1000",
  );

  await openBillingRow(page, customer.id);

  const march = page.getByTestId("month-row-2028-03");
  const april = page.getByTestId("month-row-2028-04");
  await expect(march).toContainText("מרץ");
  await expect(march).toContainText("2,000");
  await expect(april).toContainText("אפריל");
  await expect(april).toContainText("1,000");

  // Oldest first — chronological order and collection order are the same order.
  const keys = await page
    .locator("[data-testid^='month-row-']")
    .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-testid")));
  expect(keys).toEqual(["month-row-2028-03", "month-row-2028-04"]);

  // And the sentence somebody reads out on the phone.
  await expect(page.getByTestId("open-months-phrase")).toContainText("מרץ");
  await expect(page.getByTestId("open-months-phrase")).toContainText("אפריל");
});

test("תשלום על הזמנה שחוצה חודשים מתחלק בין החודשים שהיא מכסה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חודשים חוצים");
  // ONE order over two months: 2,000 in March, 1,000 in April.
  const orderId = await approvedOrder(
    page,
    customer.name,
    [BILLING_DATES.march[0], BILLING_DATES.march[1], BILLING_DATES.april],
    "1000",
  );

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "1500", orderId });
  await page.reload();

  // 1,500 of 3,000 is half, so every month shows half of its own charge.
  // Attributing the whole payment to March would read as April being untouched
  // — and the monthly REPORT would then disagree with this panel.
  await expect(page.getByTestId("month-paid-2028-03")).toContainText("1,000");
  await expect(page.getByTestId("month-open-2028-03")).toContainText("1,000");
  await expect(page.getByTestId("month-paid-2028-04")).toContainText("500");
  await expect(page.getByTestId("month-open-2028-04")).toContainText("500");
});

test("חודשים ששולמו במלואם מקופלים, וניתן לפתוח אותם", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חודש סגור");
  // Two orders so one month can be settled on its own.
  const marchOrder = await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "800");
  await approvedOrder(page, customer.name, [BILLING_DATES.april], "500");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "800", orderId: marchOrder });
  await page.reload();

  // March is settled, so it is out of the way — a panel that opens onto rows
  // of "0.00" buries the one row that matters.
  await expect(page.getByTestId("month-row-2028-04")).toBeVisible();
  await expect(page.getByTestId("month-row-2028-03")).toHaveCount(0);
  await expect(page.getByTestId("open-months-phrase")).toContainText("אפריל");
  await expect(page.getByTestId("open-months-phrase")).not.toContainText("מרץ");

  // Not deleted — asked for.
  await page.getByTestId("toggle-settled-months").click();
  await expect(page.getByTestId("month-row-2028-03")).toBeVisible();
  await expect(page.getByTestId("month-open-2028-03")).toContainText("0");
});

test("הפירוט לפי הזמנה קיים, מקופל, ומסכים עם החודשי", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח פירוט כפול");
  const orderId = await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "900");

  await openBillingRow(page, customer.id);

  // Folded away by default: naming an invoice is a real thing somebody does,
  // it is simply not the first question.
  await expect(page.getByTestId(`order-balance-${orderId}`)).toHaveCount(0);

  await openOrderBalances(page);
  // One order, one month, same money — the two tables are two views of it.
  await expect(page.getByTestId(`order-open-${orderId}`)).toContainText("900");
  await expect(page.getByTestId("month-open-2028-03")).toContainText("900");
});

test("הכניסה לרישום היא כפתור שאומר מה הוא עושה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const owing = await createCustomer(page, "לקוח חייב");
  await approvedOrder(page, owing.name, [BILLING_DATES.march[0]], "400");

  const settled = await createCustomer(page, "לקוח משולם");
  await approvedOrder(page, settled.name, [BILLING_DATES.march[0]], "400");
  await openBillingRow(page, settled.id);
  await recordPayment(page, { amount: "400" });

  // The label says what the click leads to, and it differs by whether there is
  // anything to collect. Each row is found the way a person finds it — by
  // name — since the list is paged and a new customer is rarely on page one.
  await page.goto(`/billing?q=${encodeURIComponent(owing.name)}`);
  await expect(page.getByTestId(`billing-expand-${owing.id}`)).toContainText("רישום תשלום");
  await page.goto(`/billing?q=${encodeURIComponent(settled.name)}`);
  await expect(page.getByTestId(`billing-expand-${settled.id}`)).toContainText("פירוט תשלומים");
});
