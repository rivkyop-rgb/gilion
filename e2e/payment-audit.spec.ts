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
 * US-010 AC-5: every change to payment data is recorded with who and when, and
 * with the value BEFORE and after — and it is visible in the interface, not
 * only in a table nobody opens.
 *
 * conventions.md §6 puts the audit row in the same transaction as the change,
 * so the trail cannot disagree with the data.
 */
test("שינוי סכום נרשם ביומן עם הערך הקודם והחדש, ומוצג בשורה המורחבת", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח יומן");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "1000");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "300", invoice: "INV-AUDIT" });

  const row = page
    .getByTestId(`payment-list-${customer.id}`)
    .locator("tr[data-testid^='payment-row-']");
  const paymentId = (await row.first().getAttribute("data-testid"))!.replace("payment-row-", "");

  await page.getByTestId(`edit-payment-${paymentId}`).click();
  await page.getByTestId(`edit-amount-${paymentId}`).fill("750");
  await page.getByTestId(`save-edit-${paymentId}`).click();
  await expect(page.getByTestId("payment-note")).toBeVisible();

  await page.reload();
  // The trail lives in a dialog now — it was a fourth list pushing the work off
  // the screen. It has to be asked for.
  await page.getByTestId("open-payment-history").click();
  const history = page.getByTestId("payment-history");
  await expect(history).toBeVisible();
  // Both ends of the change, in the screen: 300 became 750.
  await expect(history).toContainText("300");
  await expect(history).toContainText("750");
  // And who did it.
  await expect(history).toContainText("מנהל");
});

test("הרישום עצמו נרשם ביומן, ונראה גם במסך לוג הביקורת", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח לוג ביקורת");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "600");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "600", invoice: "INV-LOG" });

  // Reload first, like the tests above. Clicking the trigger while the panel's
  // own `router.refresh()` is still in flight opens a dialog that the re-render
  // then unmounts — the failure reads as "payment-history not found" and says
  // nothing about the race that caused it.
  await page.reload();
  await page.getByTestId("open-payment-history").click();
  await expect(page.getByTestId("payment-history")).toContainText("רישום תשלום");

  // The same act, in the admin-only trail — one of the seven audited actions
  // (conventions.md §6). The screen prints the action key itself.
  await page.goto("/audit");
  await expect(page.locator("body")).toContainText("update_payment");
});

test("ביטול רישום נרשם אף הוא — אין מחיקה שקטה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח יומן ביטול");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "250");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "250" });

  const row = page
    .getByTestId(`payment-list-${customer.id}`)
    .locator("tr[data-testid^='payment-row-']");
  const paymentId = (await row.first().getAttribute("data-testid"))!.replace("payment-row-", "");

  await page.getByTestId(`cancel-payment-${paymentId}`).click();
  await expect(page.getByTestId("payment-note")).toContainText("בוטל");

  await page.reload();
  await page.getByTestId("open-payment-history").click();
  await expect(page.getByTestId("payment-history")).toContainText("ביטול רישום תשלום");
});
