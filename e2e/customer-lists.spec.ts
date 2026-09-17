import { expect, test, type Page } from "@playwright/test";

import { USERS, login, loginAsAdmin, orderRef } from "./helpers";
import { BILLING_DATES, approvedOrder, createCustomer } from "./billing-helpers";

/**
 * The five lists on a customer card, once the customer is not new (user,
 * 16/09/2026): show the recent ones, page through the rest, search each on its
 * own, change how many rows, and take any of them out as a spreadsheet.
 *
 * The bug underneath the request: each list ended in a bare `take: 100` (200
 * for payments), so a veteran customer silently stopped having older rows while
 * the screen went on looking complete.
 */

/**
 * A customer with more rows than one page holds.
 *
 * The REF is captured as each order is approved, while its page is still open.
 * Order numbers are a real per-business sequence — nothing about the id
 * predicts the label, so a spec cannot compute one.
 */
async function customerWithHistory(page: Page, count: number) {
  const customer = await createCustomer(page, "לקוח ותיק");
  const orders: string[] = [];
  const refs: string[] = [];
  for (let i = 0; i < count; i++) {
    orders.push(await approvedOrder(page, customer.name, [BILLING_DATES.march[i % 3]!], "500"));
    refs.push(await orderRef(page));
  }
  return { ...customer, orders, refs };
}

test("ברירת המחדל היא עשר שורות, עם דפדוף ומונה שאומר כמה יש", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await customerWithHistory(page, 12);

  await page.goto(`/customers/${customer.id}`);

  // Twelve orders, ten shown, and the count says so rather than the list simply
  // ending — which is what the old `take: 100` did at a hundred.
  await expect(page.getByTestId("o-range")).toContainText("1–10 מתוך 12");
  await expect(page.getByTestId("customer-orders").locator("tbody tr")).toHaveCount(10);
  await expect(page.getByTestId("o-page")).toContainText("1 / 2");

  await page.getByTestId("o-next").click();
  await expect(page.getByTestId("o-range")).toContainText("11–12 מתוך 12");
  await expect(page.getByTestId("customer-orders").locator("tbody tr")).toHaveCount(2);

  // On the last page the next arrow is not a link at all.
  await expect(page.getByTestId("o-next")).toHaveAttribute("aria-disabled", "true");
});

test("כל קטגוריה מדפדפת בנפרד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await customerWithHistory(page, 12);

  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId("o-next").click();

  // The orders moved; the publications did not. Five lists share this page and
  // each has to page without disturbing the other four.
  await expect(page.getByTestId("o-page")).toContainText("2 / 2");
  await expect(page.getByTestId("p-page")).toContainText("1 / 2");
});

test("שינוי מספר השורות לעמוד", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await customerWithHistory(page, 12);

  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId("o-size").selectOption("50");
  await page.getByTestId("o-size-go").click();

  await expect(page.getByTestId("customer-orders").locator("tbody tr")).toHaveCount(12);
  await expect(page.getByTestId("o-page")).toContainText("1 / 1");
});

test("חיפוש לפי מספר הזמנה מוצא את ההזמנה ואת הפרסומים שלה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await customerWithHistory(page, 12);

  // The number as a person reads it off their own screen.
  const orderNumber = customer.refs[0]!;

  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId("o-search").fill(orderNumber);
  await page.getByTestId("o-search-go").click();

  await expect(page.getByTestId("o-range")).toContainText("1 מתוך 1");
  await expect(page.getByTestId("customer-orders")).toContainText(orderNumber);

  // The same number against the publications: which insertions came off that
  // order. Asked for by name.
  await page.goto(`/customers/${customer.id}`);
  await page.getByTestId("p-search").fill(orderNumber);
  await page.getByTestId("p-search-go").click();

  await expect(page.getByTestId("p-range")).toContainText("1 מתוך 1");
  await expect(page.getByTestId("customer-publications")).toContainText(orderNumber);
});

test("כל פרסום אומר מאיזו הזמנה הוא בא", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await createCustomer(page, "לקוח עמודת הזמנה");
  const orderId = await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "500");
  const ref = await orderRef(page);

  await page.goto(`/customers/${customer.id}`);
  const table = page.getByTestId("customer-publications");
  await expect(table).toContainText("הזמנה");
  // And it is a link to that order, not just a number to copy.
  const link = page.locator("[data-testid^='publication-order-']").first();
  await expect(link).toContainText(ref);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}`));
});

test("חיפוש שמצמצם את הרשימה לא משאיר אותך בעמוד שכבר לא קיים", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await customerWithHistory(page, 12);

  const orderNumber = customer.refs[0]!;

  // On page 2, then a search that leaves one row. An un-clamped page 2 would
  // show an empty table, which reads as "no results" when there is one.
  await page.goto(`/customers/${customer.id}?o_page=2`);
  await page.getByTestId("o-search").fill(orderNumber);
  await page.getByTestId("o-search-go").click();

  await expect(page.getByTestId("customer-orders")).toContainText(orderNumber);
  await expect(page.getByTestId("o-range")).toContainText("1 מתוך 1");
});

test("ייצוא מוריד קובץ שנפתח באקסל, עם החיפוש שעל המסך", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await customerWithHistory(page, 12);
  const orderNumber = customer.refs[0]!;

  await page.goto(`/customers/${customer.id}`);

  const all = await page.request.get(`/api/export/customer/${customer.id}/orders`);
  expect(all.headers()["content-type"]).toContain("text/csv");
  const body = await all.text();
  // The BOM is the whole reason Hebrew survives the trip into Excel: without it
  // Excel reads UTF-8 as the system code page and renders mojibake.
  expect(body.startsWith("﻿")).toBe(true);
  expect(body).toContain("הזמנה");
  // Every row, not just the page on screen.
  expect(body.trim().split("\r\n")).toHaveLength(13);

  // And the export follows the search the screen is showing.
  const filtered = await page.request.get(
    `/api/export/customer/${customer.id}/orders?q=${encodeURIComponent(orderNumber)}`,
  );
  expect((await filtered.text()).trim().split("\r\n")).toHaveLength(2);
});

test("גרפיקאית לא מייצאת כסף, גם לא דרך ה־URL (FR-8)", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await createCustomer(page, "לקוח ייצוא חסום");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "777");

  await login(page, USERS.designer);

  // Refused by the server, not merely unlinked in the page.
  for (const section of ["orders", "payments", "months"]) {
    const res = await page.request.get(`/api/export/customer/${customer.id}/${section}`);
    expect(res.status(), `${section} must be refused`).toBe(403);
  }

  // The lists they MAY export carry no money in them.
  const publications = await page.request.get(`/api/export/customer/${customer.id}/publications`);
  expect(publications.status()).toBe(200);
  const text = await publications.text();
  expect(text).not.toContain("מחיר");
  expect(text).not.toContain("777");
});
