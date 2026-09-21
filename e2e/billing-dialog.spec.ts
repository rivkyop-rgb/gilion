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
 * Recording a payment happens in a window (user, 15/09/2026).
 *
 * It used to be an expanded table row — a form and three tables squeezed into
 * one `<td colSpan={8}>`, sharing column widths with the list behind it and
 * pushing every row below it down the page.
 *
 * What these specs pin is the part that is easy to lose in a rewrite: the
 * window is opened BY THE URL. That is what makes it survive a reload and a
 * save, what lets the customer card link straight into it, and what keeps the
 * specs from having to hunt for a row to click.
 */

test("הרישום נפתח בחלון, ונסגר ב־Esc ובכפתור", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חלון");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "700");

  await page.goto("/billing");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByTestId(`billing-expand-${customer.id}`).click();

  // A real dialog, not a row: the name and the balance are its header.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(customer.name);
  await expect(dialog).toContainText("700");
  await expect(page).toHaveURL(new RegExp(`customer=${customer.id}`));

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Closing drops the customer from the URL — the two cannot disagree.
  await expect(page).not.toHaveURL(/customer=/);

  await page.getByTestId(`billing-expand-${customer.id}`).click();
  await page.getByTestId("close-payment-dialog").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/customer=/);
});

test("החלון נשאר פתוח אחרי שמירה, ומעודכן", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חלון פתוח");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "900");

  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "400" });

  // A save runs router.refresh(); the window is held open by the URL, so it
  // survives that and shows the new numbers rather than closing on success.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("month-open-2028-03")).toContainText("500");
  await expect(page.getByTestId("month-paid-2028-03")).toContainText("400");
});

test("קישור ישיר מכרטיס הלקוח פותח את החלון", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח קישור ישיר");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "350");

  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId("go-to-billing").click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(customer.name);
});

test("לקוח בלי הזמנה מאושרת אומר זאת, ולא נשאר קישור מת", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  // A customer with nothing: no binding order, no payment. They have no row on
  // the billing screen, so the link from their card used to lead nowhere at all.
  const customer = await createCustomer(page, "לקוח בלי הזמנות");

  await page.goto(`/billing?customer=${customer.id}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("billing-customer-missing")).toContainText(
    "אין עדיין הזמנה מאושרת",
  );
});

test("המסך שמאחורי החלון ממשיך להציג את השורה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח רקע");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "250");

  await openBillingRow(page, customer.id);
  // The list is context, not something the window replaced: the row is still
  // there, with the same number the window's header carries.
  await expect(page.getByTestId(`billing-outstanding-${customer.id}`)).toContainText("250");
});
