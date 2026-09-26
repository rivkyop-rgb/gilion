import { expect, test, type Page } from "@playwright/test";

import { loginAsAdmin, orderRef, passOrderWarnings } from "./helpers";
import { validPdf } from "./ad-fixtures";
import { adCard, uploadFile } from "./ad-helpers";

/**
 * FR-5 and stage 05 rules 5, 6 and 10, end to end.
 *
 * Linking is reachable from BOTH directions by design (stage 05 §מסכים item
 * 4), and both must move the publication through the state machine. One ad is
 * then linked to a second publication, because one file legitimately serves
 * several (rule 6).
 */

/** Creates an approved order for the first customer and returns its ref. */
async function approvedOrder(page: Page, dates: string[]): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  for (const [index, date] of dates.entries()) {
    await page.getByTestId("line-date").fill(date);
    await page.getByTestId("line-price").fill("1000");
    const warning = page.getByTestId("off-schedule-warning");
    if (await warning.isVisible()) await page.getByTestId("confirm-special-edition").check();
    // The builder clears its date selection after each submit, so the next
    // fill must not race the re-render — waiting on the row count is what
    // makes the second line land instead of silently doing nothing.
    await expect(page.getByTestId("add-line")).toBeEnabled();
    await page.getByTestId("add-line").click();
    await expect(page.getByTestId("order-line-count")).toContainText(`${index + 1} תאריכים`);
  }

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  return orderRef(page);
}

test("שיוך מודעה לפרסום — משני הכיוונים — מזיז את הסטטוס דרך מכונת המצבים", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const stamp = Date.now();
  const orderRef = await approvedOrder(page, ["2026-12-01", "2026-12-08"]);

  // The customer the order picker chose first is also the one the upload
  // picker lists first, so the ad and the publications share a customer.
  const file = await validPdf(`linkable-${stamp}.pdf`);
  await page.goto("/advertisements");
  await page.getByTestId("open-upload").click();
  await page.getByTestId("upload-file").setInputFiles(file);
  await page.getByTestId("upload-customer").click();
  await page.getByTestId("upload-customer-list").getByRole("option").first().click();
  await page.getByTestId("submit-upload").click();
  await expect(page.getByTestId("upload-panel")).toHaveCount(0);

  // --- direction 1: from the publication row -----------------------------
  await page.goto("/publications");
  const row = page.locator("tbody tr").filter({ hasText: orderRef }).first();
  // `planned`, not `missing_ad`: a fresh publication only becomes "חסרה מודעה"
  // when the reminder window opens (conventions.md §3, stage 10).
  await expect(row).toContainText("מתוכנן");

  const publicationId = (await row.getAttribute("data-testid"))!.replace("publication-row-", "");
  await page.getByTestId(`row-link-${publicationId}`).click();
  // Addressed by the option testid, not by position: the picker is a dialog
  // and its first button is the close X.
  await page
    .getByTestId(`row-link-list-${publicationId}`)
    .locator('[data-testid^="ad-picker-option-"]')
    .first()
    .click();

  // AD_LINKED on a valid ad that belongs to the customer goes all the way.
  await expect(page.locator(`[data-testid="publication-row-${publicationId}"]`)).toContainText(
    "מוכן לשיבוץ",
  );

  // --- rule 6: the same file serves a second publication ------------------
  await page.goto("/advertisements");
  await adCard(page, file.name).click();
  await page.getByTestId("open-link").click();
  await page.getByTestId("link-panel").getByRole("button").first().click();
  await expect(page.locator('[data-testid="ad-publications"] tbody tr')).toHaveCount(2);

  // --- unlink walks it back ----------------------------------------------
  await page.getByTestId(`unlink-${publicationId}`).click();
  await expect(page.locator('[data-testid="ad-publications"] tbody tr')).toHaveCount(1);

  await page.goto("/publications");
  await expect(page.locator(`[data-testid="publication-row-${publicationId}"]`)).toContainText(
    "חסרה מודעה",
  );
});
