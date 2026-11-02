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
 * US-010 AC-4: the amount, the date and the invoice number are editable in
 * place, and what was saved is what is shown afterwards.
 *
 * The status is NOT editable anywhere on this screen, and the second test is
 * what proves it: rule 7 makes it derived, so a control that set it would be a
 * way to claim money arrived that never did.
 */
test("עריכה inline של סכום, תאריך וחשבונית — נשמרת ומוצגת", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח עריכה");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "2000");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "500", date: "2026-09-01", invoice: "INV-A" });

  // Partly paid: 500 of 2,000.
  await expect(page.getByTestId(`billing-paid-${customer.id}`)).toContainText("500");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("1,500");
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם חלקית");

  // Now correct it in place, to the full amount.
  const row = page
    .getByTestId(`payment-list-${customer.id}`)
    .locator("tr[data-testid^='payment-row-']");
  const paymentId = (await row.first().getAttribute("data-testid"))!.replace("payment-row-", "");

  await page.getByTestId(`edit-payment-${paymentId}`).click();
  await page.getByTestId(`edit-amount-${paymentId}`).fill("2000");
  await page.getByTestId(`edit-invoice-${paymentId}`).fill("INV-B");
  await page.getByTestId(`edit-date-${paymentId}`).fill("2026-09-02");
  await page.getByTestId(`save-edit-${paymentId}`).click();

  // Waited on the SERVER's answer, not on the form closing: the note carries
  // the derived status, which only exists once the transaction committed.
  await expect(page.getByTestId("payment-note")).toContainText("שולם");

  await page.reload();
  await expect(page.getByTestId(`billing-paid-${customer.id}`)).toContainText("2,000");
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("0");
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");
  await expect(page.getByTestId(`payment-list-${customer.id}`)).toContainText("INV-B");
});

test("אין שדה לקביעת סטטוס תשלום — הוא נגזר בלבד (כלל 7)", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח ללא סטטוס ידני");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "400");
  await openBillingRow(page, customer.id);

  const form = page.getByTestId("record-payment-form");
  await expect(form).toBeVisible();
  // Four fields and no fifth: order, amount, date, invoice.
  await expect(form.getByTestId("payment-amount")).toBeVisible();
  await expect(form.getByTestId("payment-date")).toBeVisible();
  await expect(form.getByTestId("payment-invoice")).toBeVisible();
  // No select at all: invoices are TICKED (31/10/2026). A status control
  // would be a way to claim money that never arrived.
  await expect(form.locator("select")).toHaveCount(0);
  await expect(form.getByTestId("payment-invoices")).toBeVisible();
});

test("סכום שלילי נדחה, וההודעה אומרת מה לעשות במקום", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח סכום שלילי");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "400");
  await openBillingRow(page, customer.id);

  await page.getByTestId("payment-amount").fill("-50");
  await page.getByTestId("save-payment").click();

  await expect(page.getByTestId("form-error")).toContainText("לבטל את הרישום");
  await expect(page.getByTestId("no-payments")).toBeVisible();
});

test("ביטול רישום מחזיר את היתרה בלי למחוק אותו (כלל 10)", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח ביטול רישום");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "900");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "900", invoice: "INV-CANCEL" });
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");

  const row = page
    .getByTestId(`payment-list-${customer.id}`)
    .locator("tr[data-testid^='payment-row-']");
  const paymentId = (await row.first().getAttribute("data-testid"))!.replace("payment-row-", "");

  await page.getByTestId(`cancel-payment-${paymentId}`).click();
  await expect(page.getByTestId("payment-note")).toContainText("בוטל");

  await page.reload();
  // The balance came back...
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("900");
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("לא שולם");
  // ...and the record is still there, struck through. There is no delete.
  await expect(page.getByTestId(`payment-row-${paymentId}`)).toBeVisible();
  await expect(page.getByTestId(`payment-row-${paymentId}`)).toHaveClass(/line-through/);
});
