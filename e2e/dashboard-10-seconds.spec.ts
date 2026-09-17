import { expect, test } from "@playwright/test";

import { BOARD_DATE } from "./global-setup";
import { loginAsAdmin } from "./helpers";

/**
 * The success criterion from prd.md §7, asserted as it is written:
 *
 *   "בעל עיתון רואה תוך 10 שניות מי מפרסם השבוע, למי חסרה מודעה, מי לא שובץ
 *    ומי חייב כסף"
 *
 * Four questions, ONE screen, and a clock. The clock is the part that is easy
 * to leave out and the part that decays: a dashboard that answers everything
 * after a nine-second wait has not met the criterion, and nothing about the
 * markup would ever say so.
 *
 * The budget here is the criterion's own ten seconds, not the two-second
 * internal target of validation rule 11. They are different promises — rule 11
 * is about the query plan under a thousand publications, this is about a person
 * getting their answer — and a spec that asserted the tighter one would fail on
 * a loaded machine for a reason that has nothing to do with the product.
 */

/** The Sunday–Saturday week that contains the fixture's publication date. */
const WEEK = { from: "2027-06-13", to: "2027-06-19" };

test.describe("לוח בקרה — ארבע שאלות ממסך אחד", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("ארבע השאלות נענות מהמסך הראשון, ובתוך התקציב", async ({ page }) => {
    const started = Date.now();
    await page.goto("/dashboard");
    // Not `domcontentloaded`: the numbers are what is being timed, and they
    // arrive with the server render. Waiting for the last card is what makes
    // this a measurement of the answer rather than of the shell around it.
    await expect(page.getByTestId("kpi-openIssues")).toBeVisible();
    const elapsed = Date.now() - started;

    // 1. מי מפרסם השבוע
    await expect(page.getByTestId("kpi-week")).toBeVisible();
    // 2. למי חסרה מודעה
    await expect(page.getByTestId("kpi-missingAd")).toBeVisible();
    // 3. מי לא שובץ
    await expect(page.getByTestId("kpi-notPlaced")).toBeVisible();
    // 4. מי חייב כסף
    await expect(page.getByTestId("kpi-debt")).toBeVisible();

    expect(elapsed).toBeLessThan(10_000);
  });

  test("שישה כרטיסים, ולא אחד מהם הוא 'מודעות להגהה'", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-kpis").locator("> a")).toHaveCount(6);
    // The proofing state Stitch invented is not in the FR-4 enum, so a card
    // for it could only ever show a number no query can produce.
    await expect(page.getByTestId("dashboard-kpis")).not.toContainText("הגהה");
  });

  test("מספר שהוא אפס מוצג ולא נעלם", async ({ page }) => {
    // `{count && <span/>}` drops a zero, and on a row of cards that all show
    // numbers the gap reads as "unknown" rather than as the answer. "חסרי
    // מודעה · 0" is frequently exactly what somebody opened the screen for.
    await page.goto("/dashboard?from=2020-01-01&to=2020-01-07");
    const value = page.getByTestId("kpi-week-value");
    await expect(value).toBeVisible();
    await expect(value).toHaveText(/\d/);
  });

  test("השבוע הוא ראשון עד שבת, וטבלת הפרסומים אומרת מה היא מציגה", async ({ page }) => {
    await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);
    await expect(page.getByTestId("week-table")).toBeVisible();
    // The fixture puts six publications on BOARD_DATE; the table for that week
    // must contain it rather than a rolling seven days from today.
    await expect(page.getByTestId("week-table")).toContainText(
      new Date(`${BOARD_DATE}T00:00:00Z`).getUTCDate().toString(),
    );
    await expect(page.getByTestId("week-count")).toBeVisible();
  });

  test("שורה שממתינה למודעה או שלא שובצה מסומנת ברשימה", async ({ page }) => {
    // US-001 AC-5. The fixture's `noAd` publication is on BOARD_DATE with no
    // artwork, so the week that contains it must carry at least one marked row.
    await page.goto(`/dashboard?from=${WEEK.from}&to=${WEEK.to}`);
    const marked = page.locator('[data-testid^="week-row-"][data-attention="missing_ad"]');
    await expect(marked.first()).toBeVisible();
    await expect(marked.first()).toContainText("ממתין למודעה");
  });
});
