import { expect, test } from "@playwright/test";

import { PAYMENT_STATUS_LABELS } from "@/lib/domain/payment-status";
import { USERS, login, loginAsAdmin } from "./helpers";

/**
 * FR-8 on the dashboard: a designer never sees payment data.
 *
 * The assertion that matters is NOT that the column is absent from the screen.
 * It is that no response on this route carries the figures at all — validation
 * rule 10 says the filtering happens in the server, and a `hidden` class would
 * satisfy every visual check while shipping the numbers to a browser anyone
 * can open the devtools on.
 *
 * So the last two tests read the PAYLOAD. That is also what makes the rule
 * survive a refactor: somebody who later adds `payment_status` to the shared
 * publication query would pass every other test in this file.
 */

const WEEK = { from: "2027-06-13", to: "2027-06-19" };

test.describe("הדשבורד של גרפיקאית", () => {
  test("אין כרטיס חוב, ויש כרטיס שיבוץ", async ({ page }) => {
    await login(page, USERS.designer);
    await page.goto("/dashboard");

    await expect(page.getByTestId("kpi-notPlaced")).toBeVisible();
    await expect(page.getByTestId("kpi-debt")).toHaveCount(0);
    // Five cards, not six with one blanked out: an empty slot in a row of
    // numbers reads as a figure that failed to load.
    await expect(page.getByTestId("dashboard-kpis").locator("> a")).toHaveCount(5);
  });

  test("אין עמודת סטטוס תשלום בטבלה", async ({ page }) => {
    await login(page, USERS.designer);
    await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);

    await expect(page.getByTestId("week-table")).toBeVisible();
    await expect(page.getByTestId("col-payment")).toHaveCount(0);
    await expect(page.getByTestId("week-table").locator("thead th")).toHaveCount(8);
  });

  test("שום תשובה של השרת אינה נושאת נתוני תשלום", async ({ page }) => {
    await login(page, USERS.designer);
    const response = await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);
    const body = (await response?.text()) ?? "";

    expect(body.length).toBeGreaterThan(0);
    for (const label of Object.values(PAYMENT_STATUS_LABELS)) {
      expect(body).not.toContain(label);
    }
    expect(body).not.toContain("payment_status");
    expect(body).not.toContain("סטטוס תשלום");
  });

  test("אותה בקשה בדיוק כן נושאת אותם למנהלת", async ({ page }) => {
    /*
     * The control. Without it, the test above passes just as happily against a
     * dashboard that lost its payment column for everybody — which is a
     * regression the FR-8 suite would then certify as correct.
     */
    await loginAsAdmin(page);
    const response = await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);
    const body = (await response?.text()) ?? "";
    expect(body).toContain("סטטוס תשלום");
  });

  test("גרפיקאית לא מגיעה לגבייה גם בכתובת ישירה", async ({ page }) => {
    await login(page, USERS.designer);
    await page.goto("/billing?status=debt");
    // The guard is the server's, not the sidebar's.
    await expect(page.locator("body")).not.toContainText("גבייה ותשלומים");
  });
});
