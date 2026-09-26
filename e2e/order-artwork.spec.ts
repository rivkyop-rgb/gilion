import { expect, test, type Page } from "@playwright/test";

import {
  NEWSPAPERS,
  addOrderLine,
  loginAsAdmin,
  orderRef,
  pickOrderNewspaper,
  passOrderWarnings,
} from "./helpers";
import { validPdf } from "./ad-fixtures";

/**
 * One advertisement, several dates — the ordinary case in this business.
 *
 * The customer sends a single file and asks for it to run five times. Before
 * this, that file had nowhere to go while the order was a draft (publications
 * do not exist yet), so it had to be parked in the library and attached by
 * hand to every publication after approval.
 */
async function draftWithLines(page: Page, dates: string[]): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  // The ceiling this spec asserts on belongs to ONE newspaper; the builder's
  // first option moves as other specs create newspapers.
  await pickOrderNewspaper(page, NEWSPAPERS.alpha);

  for (const [index, date] of dates.entries()) {
    await addOrderLine(page, date, "1000", index + 1);
  }
  return id;
}

test("מודעה שצורפה להזמנה משויכת אוטומטית לכל הפרסומים באישור", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const id = await draftWithLines(page, ["2026-12-01", "2026-12-08", "2026-12-15"]);

  // The upload area names the strictest ceiling among the order's own lines.
  const form = page.getByTestId("order-artwork-form");
  await expect(form).toBeVisible();
  await expect(form).toContainText("10 MB");

  const file = await validPdf(`order-artwork-${Date.now()}.pdf`);
  await page.getByTestId("order-artwork-file").setInputFiles(file);
  await page.getByTestId("order-artwork-submit").click();

  await expect(page.getByTestId("order-artwork-attached")).toContainText(file.name);

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

  // All three publications carry the file, and the state machine took each of
  // them straight past "waiting for artwork".
  const rows = page.locator('[data-testid="publications-preview"] tbody tr');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(rows.nth(i)).toContainText("מוכן לשיבוץ");
    await expect(rows.nth(i)).toContainText(file.name);
  }

  // The upload form is gone once approved: from here each publication takes
  // its own file, which is the finer-grained control.
  await expect(page.getByTestId("order-artwork-form")).toHaveCount(0);
});

test("שיוך מודעה אחת לכל הפרסומים הפתוחים של הלקוח בלחיצה אחת", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  await draftWithLines(page, ["2026-11-03", "2026-11-10"]);
  await page.getByTestId("submit-order").click();
  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  const ref = await orderRef(page);

  // A file uploaded the ordinary way, assigned to the same customer.
  const file = await validPdf(`bulk-${Date.now()}.pdf`);
  await page.goto("/advertisements");
  await page.getByTestId("open-upload").click();
  await page.getByTestId("upload-file").setInputFiles(file);
  await page.getByTestId("upload-customer").click();
  await page.getByTestId("upload-customer-list").getByRole("option").first().click();
  await page.getByTestId("submit-upload").click();
  await expect(page.getByTestId("upload-panel")).toHaveCount(0);

  await page.goto("/advertisements");
  await page.locator('[data-testid^="ad-card-"]').filter({ hasText: file.name }).first().click();

  await page.getByTestId("link-all-publications").click();
  await expect(page.locator('[data-testid="ad-publications"] tbody tr')).not.toHaveCount(0);

  await page.goto("/publications");
  const rows = page.locator("tbody tr").filter({ hasText: ref });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("מוכן לשיבוץ");
  await expect(rows.last()).toContainText("מוכן לשיבוץ");
});
