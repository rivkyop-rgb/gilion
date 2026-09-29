import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { BILLING_DATES, MARCH_FIRST_WEEK, approvedOrder, createCustomer } from "./billing-helpers";

/**
 * US-010 AC-1 asks for a WEEKLY report as well as a monthly one, and the design
 * only drew the monthly (docs/design/gaps.md §ה). This is the missing half.
 *
 * The three fixture dates are three consecutive Tuesdays, so each falls in its
 * own week — which makes "the weekly view is not just the monthly one renamed"
 * something the test can actually assert.
 */
test("דוח שבועי קיים, ומראה רק את השבוע שנבחר", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח דוח שבועי");
  // 1,000 × 3, one per week.
  await approvedOrder(page, customer.name, BILLING_DATES.march, "1000");

  await page.goto(
    `/reports?tab=payments&period=week&anchor=${MARCH_FIRST_WEEK.anchor}&customer=${customer.id}`,
  );

  // The week is Sunday–Saturday, and the header says which.
  await expect(page.getByTestId("period-range")).toContainText(MARCH_FIRST_WEEK.from);
  await expect(page.getByTestId("period-range")).toContainText(MARCH_FIRST_WEEK.to);

  const row = page.getByTestId(`report-row-${customer.id}`);
  // One insertion in this week, not the three the month holds.
  await expect(row).toContainText("1,000");
  await expect(row).not.toContainText("3,000");
  // Deliberately NOT asserting `report-total-count`: that is the total for the
  // whole period across every customer, and the other specs in this suite sell
  // onto the same fixture dates. A number that counts other files' rows changes
  // when an unrelated spec is added (CLAUDE.md — fixture dates are shared).
});

test("חצים מזיזים שבוע קדימה ואחורה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח ניווט שבועות");
  await approvedOrder(page, customer.name, BILLING_DATES.march, "1000");

  await page.goto(
    `/reports?tab=payments&period=week&anchor=${MARCH_FIRST_WEEK.anchor}&customer=${customer.id}`,
  );
  await expect(page.getByTestId(`report-row-${customer.id}`)).toBeVisible();

  // Forward one week: the second Tuesday.
  await page.getByTestId("period-next").click();
  await expect(page.getByTestId("period-range")).toContainText("2028-03-12");
  await expect(page.getByTestId(`report-row-${customer.id}`)).toContainText("1,000");

  // Back two, ONE AT A TIME with the intermediate week asserted between them.
  // Two clicks in a row both land on the link as it was rendered before the
  // first navigation, so the second one repeats the first jump and the week
  // moves once instead of twice — which reads as an arrow that skipped.
  await page.getByTestId("period-prev").click();
  await expect(page.getByTestId("period-range")).toContainText("2028-03-05");
  await page.getByTestId("period-prev").click();
  await expect(page.getByTestId("period-range")).toContainText("2028-02-27");
  await expect(page.getByText("אין פרסומים בתקופה הזאת")).toBeVisible();
});

test("החודשי סוכם את שלושת השבועות יחד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח חודשי מול שבועי");
  await approvedOrder(page, customer.name, BILLING_DATES.march, "1000");

  await page.goto(
    `/reports?tab=payments&period=month&anchor=${BILLING_DATES.march[0]}&customer=${customer.id}`,
  );
  await expect(page.getByTestId(`report-row-${customer.id}`)).toContainText("3,000");

  await page.goto(
    `/reports?tab=payments&period=week&anchor=${MARCH_FIRST_WEEK.anchor}&customer=${customer.id}`,
  );
  await expect(page.getByTestId(`report-row-${customer.id}`)).toContainText("1,000");
});

test("סינון לפי עיתון, וגם 'כל העיתונים'", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  const customer = await createCustomer(page, "לקוח סינון עיתון");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "1000");

  const url = `/reports?tab=payments&period=month&anchor=${BILLING_DATES.march[0]}&customer=${customer.id}`;
  await page.goto(url);
  // "All newspapers" is the default question, and it finds the row.
  await expect(page.getByTestId("report-newspaper")).toHaveValue("all");
  await expect(page.getByTestId(`report-row-${customer.id}`)).toBeVisible();

  // The catalogue is a different newspaper: the same period holds nothing of
  // this customer's there.
  await page.getByTestId("report-newspaper").selectOption("paper_catalog");
  await page.getByTestId("report-apply").click();
  await expect(page.getByTestId(`report-row-${customer.id}`)).toHaveCount(0);
});
