import { expect, test, type Page } from "@playwright/test";

import { USERS, addOrderLine, login, orderRef, passOrderWarnings } from "./helpers";

/**
 * The order reads by what was ORDERED; the publications list keeps the detail.
 *
 * Nobody orders "a full page on the 1st" and then "a full page on the 8th" —
 * they order a full page three times.
 */
async function draft(page: Page): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function addDate(page: Page, date: string, price: string, dates: number) {
  await addOrderLine(page, date, price, dates);
}

test("שלושה תאריכים באותו מחיר הם שורת הזמנה אחת עם סה״כ נכון", async ({ page }) => {
  test.slow();
  await login(page, USERS.sales);
  await draft(page);

  await addDate(page, "2026-12-01", "1000", 1);
  await addDate(page, "2026-12-08", "1000", 2);
  await addDate(page, "2026-12-15", "1000", 3);

  const rows = page.locator('[data-testid^="order-line-group-"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("3 פעמים");
  await expect(rows.first()).toContainText("3,000");

  // Three dates, one line — and the counter says both.
  await expect(page.getByTestId("order-line-count")).toContainText("3 תאריכים");
  await expect(page.getByTestId("order-line-count")).toContainText("1 שורות הזמנה");
  await expect(page.getByTestId("order-total")).toContainText("3,000");
});

test("אותו גודל בשני מחירים נשאר שתי שורות — הנחה לא נעלמת בממוצע", async ({ page }) => {
  test.slow();
  await login(page, USERS.sales);
  await draft(page);

  await addDate(page, "2026-12-01", "1000", 1);
  await addDate(page, "2026-12-08", "600", 2);

  await expect(page.locator('[data-testid^="order-line-group-"]')).toHaveCount(2);
  await expect(page.getByTestId("order-total")).toContainText("1,600");
});

test("הפירוט לפי תאריך נמצא בפרסומים, שורה לכל אחד", async ({ page }) => {
  test.slow();
  await login(page, USERS.sales);
  await draft(page);

  await addDate(page, "2026-12-01", "1000", 1);
  await addDate(page, "2026-12-08", "1000", 2);

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

  const ref = await orderRef(page);
  await page.goto(`/publications?q=${ref}`);
  await expect(page.locator("tbody tr").filter({ hasText: ref })).toHaveCount(2);
});
