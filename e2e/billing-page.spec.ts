import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import {
  BILLING_DATES,
  approvedOrder,
  createCustomer,
  openBillingRow,
  recordPayment,
} from "./billing-helpers";

/**
 * Each customer's billing is a page of its own (user, 08/11/2026: "נפתח מין
 * לוח בצד — לא נח ולא ברור … למה שלא יהיה עמוד נח, נחמד ונגיש?").
 *
 * It replaced a drawer that was opened by `?customer=X`. What these specs pin
 * is what the drawer was there to give and the page must keep: it survives a
 * save, the customer card links straight to it, old links still land on it,
 * and any customer can be reached from the billing tab — not only debtors.
 */

test("שורה בגבייה פותחת את עמוד הלקוח, והחזרה מובילה לרשימה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח עמוד");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "700");

  await page.goto("/billing");
  await page.getByTestId(`billing-expand-${customer.id}`).click();

  await expect(page).toHaveURL(new RegExp(`/billing/customers/${customer.id}$`));
  await expect(page.getByTestId(`billing-open-${customer.id}`)).toContainText(customer.name);
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("700");

  await page.getByTestId("close-payment-dialog").click();
  await expect(page).toHaveURL(/\/billing$/);
});

test("העמוד מתעדכן אחרי שמירה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח עמוד שמירה");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "900");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "400" });

  await expect(page.getByTestId("month-open-2028-03")).toContainText("500");
  await expect(page.getByTestId("month-paid-2028-03")).toContainText("400");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("500");
});

test("הכפתור בכרטיס הלקוח וקישור ישן מגיעים לאותו עמוד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח קישור ישיר");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "350");

  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId("customer-tab-payments").click();
  await page.getByTestId("go-to-billing").click();
  await expect(page.getByTestId(`billing-open-${customer.id}`)).toBeVisible();

  // A reminder or a bookmark from before the page existed.
  await page.goto(`/billing?customer=${customer.id}`);
  await expect(page).toHaveURL(new RegExp(`/billing/customers/${customer.id}$`));
});

test("גם לקוח בלי הזמנה מאושרת נפתח, מתוך מעבר ללקוח", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  // Nothing binding and no payment: no row on the list. The drawer could only
  // say "אין לו שורה כאן"; the page opens, and a payment that arrives early is
  // recorded as credit.
  const customer = await createCustomer(page, "לקוח בלי הזמנות");

  await page.goto("/billing");
  await page.getByTestId("billing-jump").fill(customer.name);
  await page.getByRole("option", { name: customer.name }).click();

  await expect(page).toHaveURL(new RegExp(`/billing/customers/${customer.id}$`));
  await expect(page.getByTestId("no-billable-orders")).toBeVisible();
});
