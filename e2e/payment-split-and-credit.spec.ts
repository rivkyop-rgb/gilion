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
 * One payment, several orders — and what is left over.
 *
 * Raised by the user after stage 08 shipped, and the second half of it was a
 * BUG: a payment recorded with no order named was written, listed, and counted
 * nowhere. It showed as a row in the history while every total on the page
 * carried on as if it had not happened.
 *
 * The four tests below are the four things that were wrong or missing:
 * splitting, the credit being counted, the per-order breakdown, and the prompt
 * that asks where a credit should go when the customer buys again.
 */

test("סכום אחד מתחלק בין ההזמנות הפתוחות, מהישנה לחדשה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח תשלום מפוצל");
  // Two separate orders: 1,000 sold first, then 600.
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "1000");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[1]], "600");

  await openBillingRow(page, customer.id);
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("1,600");

  // One sum against both, with no order named.
  await recordPayment(page, { amount: "1600", invoice: "INV-SPLIT" });

  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("0");

  // Two records, one per order — which is where the money actually went.
  const rows = page
    .getByTestId(`payment-list-${customer.id}`)
    .locator("tr[data-testid^='payment-row-']");
  await expect(rows).toHaveCount(2);
  // And they say they were one act.
  await expect(page.locator("[data-testid^='payment-part-of-']")).toHaveCount(2);
});

test("מה שנשאר אחרי סגירת החובות נזקף ליתרת הלקוח — ונספר", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח יתרה לזכות");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await openBillingRow(page, customer.id);
  // 800 against a 500 debt: 500 settles it, 300 is the customer's.
  await recordPayment(page, { amount: "800" });

  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("0");

  // THE BUG: this used to be counted nowhere at all.
  await expect(page.getByTestId(`billing-credit-${customer.id}`)).toContainText("300");
  await expect(page.getByTestId("customer-credit")).toContainText("300");
  await expect(page.getByTestId("kpi-credit")).toBeVisible();

  // And it reaches the customer card too, not only the billing screen.
  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByTestId("account-credit")).toContainText("300");
  await expect(page.getByTestId("customer-credit-note")).toContainText("300");
});

test("הפאנל אומר כמה שולם על כל הזמנה, לא רק ששולם חלקית", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח פירוט הזמנות");
  const orderId = await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "1000");

  await openBillingRow(page, customer.id);
  // Named THIS order, so nothing is split — a partial payment on one order.
  await recordPayment(page, { amount: "400", orderId });

  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם חלקית");

  // The question the status alone could not answer: partly paid HOW MUCH —
  // and the panel answers it by MONTH, which is how the question is asked.
  await expect(page.getByTestId("month-paid-2028-03")).toContainText("400");
  await expect(page.getByTestId("month-open-2028-03")).toContainText("600");

  // The same money by order, for when somebody names an invoice instead.
  await openOrderBalances(page);
  await expect(page.getByTestId(`order-paid-${orderId}`)).toContainText("400");
  await expect(page.getByTestId(`order-open-${orderId}`)).toContainText("600");
});

test("היתרה מוצעת לשיוך כשהלקוח קונה שוב, ולא זזה לבד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח יתרה להזמנה");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "800" }); // 500 settles, 300 credit.

  // A second order, opened after the credit exists.
  const second = await approvedOrder(page, customer.name, [BILLING_DATES.march[1]], "700");

  // Nothing moved on its own: the new order is untouched and still owes in full.
  await page.goto(`/orders/${second}`);
  const prompt = page.getByTestId("credit-prompt");
  await expect(prompt).toContainText("300");
  await expect(prompt).toContainText("לשייך להזמנה הזאת?");
  // ₪300 credit against ₪700 open: all of it goes on, ₪400 stays owed — and
  // the line says BOTH, because that is the decision being asked for.
  await expect(page.getByTestId("credit-prompt-detail")).toContainText("300");
  await expect(page.getByTestId("credit-prompt-detail")).toContainText("400");

  await openBillingRow(page, customer.id);
  await openOrderBalances(page);
  await expect(page.getByTestId(`order-open-${second}`)).toContainText("700");

  // Now say yes.
  await page.goto(`/orders/${second}`);
  await page.getByTestId("apply-credit").click();
  // Waits on the SERVER's answer — the note carries the amount it actually moved.
  await expect(page.getByTestId("credit-applied-note")).toContainText("300");

  await openBillingRow(page, customer.id);
  await openOrderBalances(page);
  await expect(page.getByTestId(`order-paid-${second}`)).toContainText("300");
  await expect(page.getByTestId(`order-open-${second}`)).toContainText("400");
  // The credit is spent, so the row no longer carries one.
  await expect(page.getByTestId(`billing-credit-${customer.id}`)).toHaveCount(0);
});

test("ביטול תשלום מפוצל מבטל אותו על כל ההזמנות שהוא נפרס עליהן", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח ביטול מפוצל");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "400");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[1]], "400");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "800" });
  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");

  const rows = page
    .getByTestId(`payment-list-${customer.id}`)
    .locator("tr[data-testid^='payment-row-']");
  const first = (await rows.first().getAttribute("data-testid"))!.replace("payment-row-", "");

  // Cancelling one slice undoes the whole act — a half-cancelled payment would
  // leave the balance describing something that never happened.
  await page.getByTestId(`cancel-payment-${first}`).click();
  await expect(page.getByTestId("payment-note")).toContainText("2 ההזמנות");

  await page.reload();
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("800");
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("לא שולם");
});

test("היומן יושב בדיאלוג ולא על המסך", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח יומן בדיאלוג");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "300");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "300" });

  // Closed by default — it was a fourth list pushing the work off the screen.
  await expect(page.getByTestId("payment-history-dialog")).toHaveCount(0);

  await page.reload();
  await page.getByTestId("open-payment-history").click();
  await expect(page.getByTestId("payment-history-dialog")).toBeVisible();
  await expect(page.getByTestId("payment-history")).toContainText("רישום תשלום");
});
