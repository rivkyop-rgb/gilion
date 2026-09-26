import { expect, test, type Page } from "@playwright/test";

import { addOrderLine, loginAsAdmin, orderRef, passOrderWarnings } from "./helpers";
import { validPdf } from "./ad-fixtures";
import { pngOfRoughly } from "./ad-fixtures";

/**
 * Uploading INTO a publication — the direction the library flow does not
 * cover.
 *
 * Going "library → upload → pick the customer → find the publication → link"
 * is four steps for one act, and every one of them is a chance to attach the
 * file to the wrong customer. Started from the publication, neither the
 * customer nor the newspaper is a choice at all.
 */
async function approvedOrder(page: Page, dates: string[]): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  for (const [index, date] of dates.entries()) {
    await addOrderLine(page, date, "1000", index + 1);
  }

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  return orderRef(page);
}

test("העלאת קובץ ישירות מהפרסום משייכת ללקוח ומחברת בצעד אחד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const stamp = Date.now();
  const orderRef = await approvedOrder(page, ["2026-12-01"]);

  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: orderRef }).first();
  const id = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");

  // The row states the ceiling of ITS OWN newspaper before a file is picked.
  await page.getByTestId(`row-upload-${id}`).click();
  await expect(page.getByTestId(`row-upload-form-${id}`)).toContainText("10 MB");
  await expect(page.getByTestId(`row-upload-form-${id}`)).toContainText("עיתון השבוע");

  const file = await validPdf(`from-publication-${stamp}.pdf`);
  await page.getByTestId(`row-upload-file-${id}`).setInputFiles(file);
  await page.getByTestId(`row-upload-submit-${id}`).click();

  // One act: uploaded, assigned to the publication's customer, and linked —
  // so the state machine takes it straight to ready_for_layout.
  await expect(page.locator(`[data-testid="publication-row-${id}"]`)).toContainText("מוכן לשיבוץ");
  await expect(page.locator(`[data-testid="publication-row-${id}"]`)).toContainText(file.name);

  // And it is a normal library file, with a customer — never an orphan.
  await page.goto("/advertisements");
  const card = page.locator('[data-testid^="ad-card-"]').filter({ hasText: file.name }).first();
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("ללא לקוח");
});

test("העלאה מהפרסום נמדדת מול העיתון של אותו פרסום", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  // The catalogue newspaper allows 5 MB where the weekly allows 10 (FR-21).
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  await page.getByTestId("line-newspaper").selectOption({ label: "קטלוג המרכז" });
  await addOrderLine(page, "2026-12-03", "1000", 1);

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

  const ref = await orderRef(page);
  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: ref }).first();
  const pubId = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");

  await page.getByTestId(`row-upload-${pubId}`).click();
  await expect(page.getByTestId(`row-upload-form-${pubId}`)).toContainText("5 MB");

  // 8 MB passes on the weekly and must be refused here, with that newspaper named.
  const tooBig = await pngOfRoughly(8, `eight-for-catalogue-${Date.now()}.png`);
  await page.getByTestId(`row-upload-file-${pubId}`).setInputFiles(tooBig);
  await page.getByTestId(`row-upload-submit-${pubId}`).click();

  const error = page.getByTestId("form-error");
  await expect(error).toContainText("קטלוג המרכז");
  await expect(error).toContainText("5 MB");
});
