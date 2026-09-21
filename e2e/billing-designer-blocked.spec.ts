import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import {
  BILLING_DATES,
  approvedOrder,
  createCustomer,
  openBillingRow,
  recordPayment,
} from "./billing-helpers";

/**
 * FR-8: a designer never sees payment data. Anywhere.
 *
 * Three levels, and only the third is worth much on its own: not in the menu,
 * not at the URL, and — the one that matters — NOT IN THE PAYLOAD. Hiding a
 * column in CSS leaves the number in the HTML, where View Source finds it; the
 * assertion below reads the bytes of every response the designer's session
 * receives.
 */
test("גרפיקאית נחסמת מ־/billing, ו־payment_status לא נמצא באף תשובה שלה", async ({ page }) => {
  test.slow();

  // Real money first, as admin — a designer looking at an empty business would
  // pass this test without proving anything.
  await loginAsAdmin(page);
  const customer = await createCustomer(page, "לקוח חסום לגרפיקאית");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "3300");
  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "1100", invoice: "INV-SECRET-77" });

  await login(page, USERS.designer);

  // Every body the designer's session receives, collected as it arrives —
  // with its content type, which decides how the bytes may be read.
  const bodies: { code: boolean; text: string }[] = [];
  page.on("response", async (res) => {
    const type = res.headers()["content-type"] ?? "";
    if (!type.includes("text/") && !type.includes("json") && !type.includes("javascript")) return;
    try {
      bodies.push({ code: type.includes("javascript"), text: await res.text() });
    } catch {
      // A response that was redirected or aborted has no body to read. Not a
      // gap in the check — there is nothing there to leak.
    }
  });

  // 1. The menu does not offer it.
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "גבייה ותשלומים" })).toHaveCount(0);

  // 2. The URL is refused by the SERVER, not by the menu's absence.
  await page.goto("/billing");
  await expect(page.getByText("אין לך הרשאה לעמוד הזה")).toBeVisible();

  // 3. Reports too — the other place amounts surface.
  await page.goto("/reports");
  await expect(page.getByText("אין לך הרשאה לעמוד הזה")).toBeVisible();

  // 4. And the screens they DO reach carry no payment data.
  await page.goto("/publications");
  await page.goto(`/customers/${customer.id}`);
  await expect(page.getByTestId("customer-name")).toBeVisible();
  await expect(page.getByTestId("customer-account")).toHaveCount(0);
  await expect(page.getByTestId("customer-payments-section")).toHaveCount(0);

  /*
   * THE FIELD NAME IS CODE; THE FIGURES ARE DATA.
   *
   * `payment_status` is an identifier, and it appears in the SOURCE of
   * lib/domain/payment-status.ts — which any route that imports the label map
   * pulls into the client graph, and which the dev server serves with its
   * comments intact. Matching it in a script bundle flagged a chunk every
   * session gets, identical for every user, carrying no figure at all.
   *
   * So the field name is looked for where a value could ride along with it —
   * the HTML and the flight payload — and the three figures, which only this
   * customer's records could put on the wire, are looked for everywhere.
   */
  const leaked = bodies.filter(
    ({ code, text }) =>
      (!code && text.includes("payment_status")) ||
      text.includes("INV-SECRET-77") ||
      text.includes("3,300") ||
      text.includes("1,100"),
  );
  expect(
    leaked,
    "a designer's response carried payment data — FR-8 is a server rule, not a CSS one",
  ).toHaveLength(0);
});

test("מכירות רואה דוחות ולא רואה את מסך הגבייה", async ({ page }) => {
  test.slow();
  await login(page, USERS.sales);

  // sales has read on reports (they need "who is missing artwork") and none on
  // billing, which is where money is CHANGED.
  await page.goto("/reports");
  await expect(page.getByTestId("report-tabs")).toBeVisible();

  await page.goto("/billing");
  await expect(page.getByText("אין לך הרשאה לעמוד הזה")).toBeVisible();
});

test("מנהלת חשבונות רושמת תשלום; היא היחידה מלבד מנהל שיכולה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);
  const customer = await createCustomer(page, "לקוח להנהלת חשבונות");
  await approvedOrder(page, customer.name, [BILLING_DATES.march[0]], "700");

  await login(page, USERS.accounting);
  await openBillingRow(page, customer.id);
  await recordPayment(page, { amount: "700", invoice: "INV-ACC" });

  await page.reload();
  await expect(page.getByTestId(`billing-status-${customer.id}`)).toHaveText("שולם");
});
