import { expect, test } from "@playwright/test";

import { BOARD_DATE, OPEN_DATE } from "./global-setup";
import { CUSTOMERS, NEWSPAPERS, loginAsAdmin } from "./helpers";

/**
 * US-001 AC-4: filter by newspaper, DATE, CUSTOMER and status.
 *
 * The two in capitals are the two the design left out, and they are the two a
 * publisher actually reaches for: "what is this customer running" and "show me
 * next week" are the questions, and neither can be asked with a status chip.
 */

const WEEK = { from: "2027-06-13", to: "2027-06-19" };

async function rowCount(page: import("@playwright/test").Page) {
  return page.locator('[data-testid^="week-row-"]').count();
}

test.describe("ארבעת המסננים", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);
    await expect(page.getByTestId("week-table")).toBeVisible();
  });

  test("ארבעת הפקדים קיימים על המסך", async ({ page }) => {
    await expect(page.getByTestId("filter-newspaper")).toBeVisible();
    await expect(page.getByTestId("filter-customer")).toBeVisible();
    await expect(page.getByTestId("filter-status")).toBeVisible();
    await expect(page.getByTestId("filter-from")).toBeVisible();
    await expect(page.getByTestId("filter-to")).toBeVisible();
  });

  test("סינון לפי עיתון משאיר את הטווח על כנו", async ({ page }) => {
    await page.getByTestId("filter-newspaper").selectOption(NEWSPAPERS.alpha);
    await page.getByTestId("apply-filters").click();
    await page.waitForURL(/newspaper=/);
    // The whole reason the filters write to the URL rather than to local state.
    expect(page.url()).toContain(`from=${WEEK.from}`);
    expect(page.url()).toContain(`to=${WEEK.to}`);
  });

  test("סינון לפי לקוח מצמצם את הרשימה", async ({ page }) => {
    const before = await rowCount(page);
    expect(before).toBeGreaterThan(0);

    await page.getByTestId("filter-customer").selectOption(CUSTOMERS.alphaRegular);
    await page.getByTestId("apply-filters").click();
    await page.waitForURL(/customer=/);

    await expect.poll(async () => rowCount(page)).toBeLessThanOrEqual(before);
  });

  test("שינוי טווח התאריכים מחליף את הפרסומים שעל המסך", async ({ page }) => {
    // The fixture puts publications on two different dates a week apart, so
    // moving the window has to move the contents — not merely the address bar.
    await expect(page.getByTestId("week-table")).toContainText(
      String(new Date(`${BOARD_DATE}T00:00:00Z`).getUTCDate()),
    );

    await page.getByTestId("filter-from").fill(OPEN_DATE);
    await page.getByTestId("filter-to").fill(OPEN_DATE);
    await page.getByTestId("apply-filters").click();
    await page.waitForURL(new RegExp(`from=${OPEN_DATE}`));

    await expect(page.getByTestId("week-table")).toContainText(
      String(new Date(`${OPEN_DATE}T00:00:00Z`).getUTCDate()),
    );
  });

  test("הכותרת מודה שהטבלה כבר לא מציגה את השבוע הנוכחי", async ({ page }) => {
    /*
     * The card above counts THIS week. Widening the range left a "0" directly
     * over a table of six rows — two correct numbers that read as one
     * contradiction, with nothing on screen saying they answer different
     * questions.
     */
    await expect(page.getByTestId("week-heading")).not.toHaveText("פרסומים השבוע");
    await expect(page.getByTestId("week-heading")).toContainText(WEEK.from);

    await page.goto("/dashboard");
    await expect(page.getByTestId("week-heading")).toHaveText("פרסומים השבוע");
  });

  test("סינון לפי סטטוס עובד יחד עם הטווח", async ({ page }) => {
    await page.getByTestId("filter-status").selectOption("missing_ad");
    await page.getByTestId("apply-filters").click();
    await page.waitForURL(/status=missing_ad/);
    expect(page.url()).toContain(`from=${WEEK.from}`);
  });

  test("'ניקוי' מופיע רק אחרי שסיננו משהו", async ({ page }) => {
    // The dashboard opens on this week, so both date fields are filled on a
    // completely untouched screen. A reset offered there resets nothing, and a
    // control that does nothing is one people stop trusting.
    await page.goto("/dashboard");
    await expect(page.getByTestId("clear-filters")).toHaveCount(0);

    await page.getByTestId("filter-status").selectOption("missing_ad");
    await page.getByTestId("apply-filters").click();
    await page.waitForURL(/status=missing_ad/);
    await expect(page.getByTestId("clear-filters")).toBeVisible();

    await page.getByTestId("clear-filters").click();
    await page.waitForURL(/\/dashboard$/);
  });

  test("העמוד לא קופץ לראש בכל סינון", async ({ page }) => {
    /*
     * A native GET form is a full document load and an App Router <Link>
     * scrolls to the top by default. On a dashboard whose table sits below six
     * cards and two widgets, either one throws the reader back to the top on
     * every filter change — which is read as the page reloading for no reason.
     */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    await page.getByTestId("filter-status").selectOption("missing_ad");
    await page.getByTestId("apply-filters").click();
    await page.waitForURL(/status=missing_ad/);

    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});
