import { expect, test, type Page } from "@playwright/test";

import { USERS, addOrderLine, login, orderRef, passOrderWarnings } from "./helpers";
import { validJpg, validPdf } from "./ad-fixtures";

/**
 * Once a publication has artwork: replacing it, and detaching it.
 *
 * Detaching asks first. It looks like a small tidy-up and is not — the
 * publication goes back to having no file, out of reach of the layout board
 * and back onto the reminder list.
 */
async function approvedOrder(page: Page, dates: string[]): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  for (const [index, date] of dates.entries()) {
    await addOrderLine(page, date, "500", index + 1);
  }

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  return orderRef(page);
}

test("החלפת המודעה בשורת הפרסום, וביטול שיוך שמבקש אישור", async ({ page }) => {
  test.slow();
  await login(page, USERS.admin);

  const stamp = Date.now();
  const orderRef = await approvedOrder(page, ["2026-09-01"]);

  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: orderRef }).first();
  const id = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");

  const first = await validPdf(`v1-${stamp}.pdf`);
  await page.getByTestId(`row-upload-${id}`).click();
  await page.getByTestId(`row-upload-file-${id}`).setInputFiles(first);
  await page.getByTestId(`row-upload-submit-${id}`).click();
  await expect(page.getByTestId(`row-linked-${id}`)).toContainText(first.name);

  // --- replace -----------------------------------------------------------
  const second = await validJpg(`v2-${stamp}.jpg`);
  await page.getByTestId(`row-replace-${id}`).click();
  await page.getByTestId(`row-upload-file-${id}`).setInputFiles(second);
  await page.getByTestId(`row-upload-submit-${id}`).click();

  await expect(page.getByTestId(`row-linked-${id}`)).toContainText(second.name);
  await expect(page.locator(`[data-testid="publication-row-${id}"]`)).toContainText("מוכן לשיבוץ");

  // --- detach asks first --------------------------------------------------
  await page.getByTestId(`row-unlink-${id}`).click();
  const dialog = page.getByTestId(`unlink-dialog-${id}`);
  await expect(dialog).toContainText(second.name);
  await expect(dialog).toContainText("אינו נמחק");

  // Backing out changes nothing.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(`row-linked-${id}`)).toContainText(second.name);

  await page.getByTestId(`row-unlink-${id}`).click();
  await page.getByTestId(`unlink-dialog-${id}-confirm`).click();

  await expect(page.locator(`[data-testid="publication-row-${id}"]`)).toContainText("חסר קובץ");
  await expect(page.getByTestId(`row-upload-${id}`)).toBeVisible();
});

test("העלאה להזמנה מאושרת מכסה רק את הפרסומים שעדיין בלי קובץ", async ({ page }) => {
  test.slow();
  await login(page, USERS.admin);

  const stamp = Date.now();
  await approvedOrder(page, ["2026-09-08", "2026-09-15"]);
  const orderUrl = page.url();

  // One publication gets its own file first.
  const rows = page.locator('[data-testid="publications-preview"] tbody tr');
  await expect(rows).toHaveCount(2);
  const firstRowUpload = rows.first().locator('[data-testid^="row-upload-"]').first();
  const individual = await validPdf(`single-${stamp}.pdf`);
  await firstRowUpload.click();
  await rows.first().locator('input[type="file"]').setInputFiles(individual);
  await rows.first().locator('[data-testid^="row-upload-submit-"]').click();
  await expect(rows.first()).toContainText(individual.name);

  // The order-level upload now offers to cover the ONE that is still missing.
  const bulk = page.getByTestId("order-artwork-form");
  await expect(bulk).toContainText("לפרסום היחיד שעדיין בלי קובץ");

  const rest = await validPdf(`rest-${stamp}.pdf`);
  await page.getByTestId("order-artwork-file").setInputFiles(rest);
  await page.getByTestId("order-artwork-submit").click();

  // Wait for the upload to finish before navigating: a goto() mid-flight
  // aborts the Server Action, and the symptom is a file that sometimes
  // attaches and sometimes does not. With every date covered the form has
  // nothing left to offer and disappears — that is the signal.
  await expect(page.getByTestId("order-artwork-form")).toHaveCount(0);

  await page.goto(orderUrl);
  // The one that already had a file kept it; the other took the new one.
  await expect(rows.first()).toContainText(individual.name);
  await expect(rows.last()).toContainText(rest.name);
});
