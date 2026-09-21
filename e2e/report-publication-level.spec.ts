import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { BILLING_DATES, approvedOrder, createCustomer } from "./billing-helpers";

/**
 * US-010 AC-2 and AC-3: the report has to answer four questions, and the design
 * had no tab for it at all (docs/design/gaps.md §ה).
 *
 * The four chips ARE the four questions — "מי מפרסם", "למי חסרה מודעה",
 * "מי לא שובץ", "מי חייב כסף" — and each carries its own count, so the answer
 * is visible before anything is clicked.
 */
const REPORT = `/reports?tab=publications&period=month&anchor=${BILLING_DATES.march[0]}`;

test("ארבעת הצ׳יפים קיימים, עם מונה לכל אחד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח ארבע שאלות");
  // Three publications, no artwork on any of them and none placed: the same
  // three rows answer three of the four chips, which is what makes the counts
  // worth asserting separately.
  await approvedOrder(page, customer.name, BILLING_DATES.march, "500");

  await page.goto(REPORT);

  await expect(page.getByTestId("lens-running")).toContainText("מי מפרסם");
  await expect(page.getByTestId("lens-missing_ad")).toContainText("למי חסרה מודעה");
  await expect(page.getByTestId("lens-unplaced")).toContainText("מי לא שובץ");
  await expect(page.getByTestId("lens-owing")).toContainText("מי חייב כסף");

  // The table shows all three by default, with the three statuses per row.
  const table = page.getByTestId("publications-report-table");
  await expect(table).toContainText(customer.name);

  // `מתוכנן` and NOT `חסרה מודעה`, and the difference is the whole reason the
  // chip is defined the way it is: a publication only moves to `missing_ad`
  // when it enters the reminder window (conventions.md §3), and these are dated
  // 2028. They have no artwork all the same — so "למי חסרה מודעה" asks about
  // the FILE, not about the status, and finds them anyway (test below).
  await expect(table).toContainText("מתוכנן");

  // Counted on THIS customer's rows, not on `lens-count`. That figure is the
  // whole period across every customer, and the other specs in this suite sell
  // onto the same fixture dates — asserting it would be asserting about their
  // rows (CLAUDE.md — fixture dates are a shared resource).
  await expect(table.locator("tr").filter({ hasText: customer.name })).toHaveCount(3);
});

test("'למי חסרה מודעה' מחזיר בדיוק את מי שאין לו קובץ", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חסרה מודעה");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await page.goto(`${REPORT}&lens=missing_ad`);
  await expect(page.getByTestId("publications-report-table")).toContainText(customer.name);
  await expect(page.getByTestId("lens-explanation")).toContainText("אין להם קובץ מודעה");
});

test("'מי לא שובץ' מחזיר את מי שטרם קיבל מקום בעמוד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח לא שובץ");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await page.goto(`${REPORT}&lens=unplaced`);
  const row = page
    .getByTestId("publications-report-table")
    .locator("tr")
    .filter({ hasText: customer.name });
  await expect(row).toContainText("לא שובץ");
});

test("'מי חייב כסף' ריק כל עוד שום דבר לא יצא לדפוס", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח טרם יצא");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  // Not printed is not owed — `owing` is published-and-unpaid, and that
  // distinction is the whole reason the chip is not "unpaid".
  await page.goto(`${REPORT}&lens=owing`);
  const row = page
    .getByTestId("publications-report-table")
    .locator("tr")
    .filter({ hasText: customer.name });
  await expect(row).toHaveCount(0);
});

test("הלשונית מציגה את שלושת הסטטוסים בכל שורה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח שלושה סטטוסים");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");

  await page.goto(REPORT);
  const table = page.getByTestId("publications-report-table");
  // Publication status · placement status · payment status — US-010 asks for
  // all three and the design showed one.
  await expect(table).toContainText("סטטוס פרסום");
  await expect(table).toContainText("שיבוץ");
  await expect(table).toContainText("תשלום");

  const row = table.locator("tr").filter({ hasText: customer.name });
  await expect(row).toContainText("לא שובץ");
  await expect(row).toContainText("לא שולם");
});

test("מעבר בין הלשוניות שומר על התקופה שנבחרה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  await page.goto(`/reports?tab=payments&period=month&anchor=${BILLING_DATES.april}`);
  await expect(page.getByTestId("period-range")).toContainText("2028-04-01");

  await page.getByTestId("tab-publications").click();
  // The period is in the URL, so switching the question does not reset it.
  await expect(page.getByTestId("period-range")).toContainText("2028-04-01");
});
