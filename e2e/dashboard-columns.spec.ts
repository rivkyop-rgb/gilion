import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";

/**
 * US-001 AC-3: every publication in the list shows all nine facts.
 *
 *   לקוח · עיתון · תאריך · גודל · מקור פרסום · סטטוס פרסום · סטטוס שיבוץ ·
 *   סטטוס מודעה · סטטוס תשלום
 *
 * Two of them — "מקור פרסום" and "סטטוס פרסום" — were absent from the design
 * and are the two a reader cannot reconstruct from the others, which is why
 * they are named individually below rather than only counted. "מקור" is the
 * difference between a line a rep sold and one a customer submitted through
 * the portal, and it changes who gets the phone call.
 */

const WEEK = { from: "2027-06-13", to: "2027-06-19" };

const COLUMNS = [
  ["col-customer", "לקוח"],
  ["col-newspaper", "עיתון"],
  ["col-date", "תאריך"],
  ["col-size", "גודל"],
  ["col-source", "מקור פרסום"],
  ["col-status", "סטטוס פרסום"],
  ["col-placement", "סטטוס שיבוץ"],
  ["col-ad", "סטטוס מודעה"],
  ["col-payment", "סטטוס תשלום"],
] as const;

test.describe("תשע העמודות של US-001", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);
    await expect(page.getByTestId("week-table")).toBeVisible();
  });

  for (const [testId, label] of COLUMNS) {
    test(`העמודה "${label}" קיימת`, async ({ page }) => {
      await expect(page.getByTestId(testId)).toHaveText(label);
    });
  }

  test("הטבלה מציגה בדיוק תשע עמודות למנהל", async ({ page }) => {
    await expect(page.getByTestId("week-table").locator("thead th")).toHaveCount(9);
  });

  test("שורה אמיתית נושאת ערך בכל אחת מהעמודות", async ({ page }) => {
    // A header row proves the markup; a data row proves the query behind it.
    const row = page.locator('[data-testid^="week-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row.locator("td")).toHaveCount(9);
    for (const cell of await row.locator("td").all()) {
      expect((await cell.innerText()).trim()).not.toBe("");
    }
  });

  test("מקור הפרסום מוצג כ'פנימי' או כ'פורטל לקוח'", async ({ page }) => {
    const row = page.locator('[data-testid^="week-row-"]').first();
    await expect(row.locator("td").nth(4)).toHaveText(/פנימי|פורטל לקוח/);
  });

  test("סטטוס שיבוץ הוא קישור ללוח כשקיים גיליון לתאריך", async ({ page }) => {
    // "לא שובץ" that says so and stops is a dead end: the reader wants to go
    // and place it, and the only other route is knowing that an issue is a
    // thing you open first.
    const link = page.locator('[data-testid^="week-board-"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/issues\/.+\/board/, { timeout: 20_000 });
  });
});
