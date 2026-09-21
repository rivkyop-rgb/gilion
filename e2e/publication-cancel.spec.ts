import { expect, test } from "@playwright/test";

import { USERS, addOrderLine, login, loginAsAdmin, orderRef } from "./helpers";

/**
 * Cancelling ONE publication out of an order (stage 04 rule 18).
 *
 * The customer ordered ten dates and dropped one. Before this the action
 * existed on the server, audited, and was reachable from no screen at all — so
 * the only way out was cancelling the whole order.
 */
test("ביטול פרסום בודד לא נוגע בשאר ההזמנה", async ({ page }) => {
  test.slow();
  await loginAsAdmin(page);

  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  for (const [index, date] of ["2026-10-06", "2026-10-13"].entries()) {
    await addOrderLine(page, date, "900", index + 1);
  }

  await page.getByTestId("submit-order").click();
  await page.getByTestId("approve-order").click();
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

  const ref = await orderRef(page);
  await page.goto("/publications");
  const rows = page.locator("tbody tr").filter({ hasText: ref });
  await expect(rows).toHaveCount(2);

  const first = rows.first();
  const pubId = (await first.getAttribute("data-testid"))!.replace("publication-row-", "");

  await page.getByTestId(`open-cancel-${pubId}`).click();
  await page.getByTestId(`cancel-publication-${pubId}-confirm`).click();

  // One cancelled, one untouched — and the order itself is still approved.
  await expect(page.locator(`[data-testid="publication-row-${pubId}"]`)).toContainText("בוטל");
  await expect(rows.filter({ hasText: "מתוכנן" })).toHaveCount(1);

  await page.goto(`/orders/${id}`);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
});

test("גרפיקאית לא מקבלת אפשרות לבטל פרסום", async ({ page }) => {
  // Cancelling unwinds part of a commercial agreement, so it follows the
  // orders permission — which a designer does not have (FR-8).
  await login(page, USERS.designer);
  await page.goto("/publications");
  await expect(page.locator('[data-testid^="open-cancel-"]')).toHaveCount(0);
});
