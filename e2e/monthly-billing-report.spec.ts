import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import {
  BILLING_DATES,
  approvedOrder,
  createCustomer,
  openBillingRow,
  recordPayment,
} from "./billing-helpers";

/**
 * SUCCESS CRITERION, prd.md §7:
 * "מנהלת חשבונות פותחת דוח חודשי ורואה סכום לתשלום, ששולם, יתרה ומספר חשבונית".
 *
 * All four numbers, for one customer, in one place — which is the whole reason
 * the report exists. Built end to end through the product: an order is sold,
 * part of it is paid, and the report is asked the question.
 */
test("דוח חודשי מציג לכל לקוח סכום לתשלום, ששולם, יתרה ומספר חשבונית", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח דוח חודשי");
  // Three insertions of 1000 in March 2028 — 3,000 billed.
  await approvedOrder(page, customer.name, BILLING_DATES.march, "1000");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "1200", invoice: "INV-2028-03" });

  await page.goto(`/reports?tab=payments&period=month&anchor=${BILLING_DATES.march[0]}`);

  const row = page.getByTestId(`report-row-${customer.id}`);
  await expect(row).toBeVisible();
  // ₪3,000 billed · ₪1,200 received · ₪1,800 open · the invoice number typed.
  await expect(row).toContainText("3,000");
  await expect(row).toContainText("1,200");
  await expect(row).toContainText("1,800");
  await expect(row).toContainText("INV-2028-03");

  // The period is the month, and the header says which one.
  await expect(page.getByTestId("period-range")).toContainText("2028-03-01");
  await expect(page.getByTestId("period-range")).toContainText("2028-03-31");
});

test("מנהלת חשבונות מגיעה לדוח ורואה את אותם מספרים", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await createCustomer(page, "לקוח לרואת חשבון");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "800");

  // accounting has write on billing and on reports — this is their screen.
  await login(page, USERS.accounting);

  await page.goto(`/reports?tab=payments&period=month&anchor=${BILLING_DATES.march[0]}`);
  await expect(page.getByTestId(`report-row-${customer.id}`)).toContainText("800");
});

test("הדוח נבנה מתאריך הפרסום — חודש אחר מחזיר רשימה אחרת", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח שני חודשים");
  // Two months on ONE order: three in March, one in April.
  await approvedOrder(page, customer.name, [...BILLING_DATES.march, BILLING_DATES.april], "1000");

  await page.goto(`/reports?tab=payments&period=month&anchor=${BILLING_DATES.march[0]}`);
  await expect(page.getByTestId(`report-row-${customer.id}`)).toContainText("3,000");

  await page.goto(`/reports?tab=payments&period=month&anchor=${BILLING_DATES.april}`);
  // The same order, the other month: one insertion, not four.
  await expect(page.getByTestId(`report-row-${customer.id}`)).toContainText("1,000");
});
