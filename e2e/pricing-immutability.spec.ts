import { expect, test } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * FR-17 itself is asserted in lib/data/price-immutability.test.ts, against the
 * stored number rather than rendered text. The browser version of it walked
 * four screens and two sign-ins and spent its entire budget on route
 * compilation — it was measuring the dev server, not the rule.
 *
 * What stays here is the part that genuinely needs a browser: the completion
 * guard, which depends on who is signed in.
 */

// The completion guard crosses two sign-ins, so it needs more than the
// single-screen default budget.
test.setTimeout(120_000);

test("completing an order is blocked while a publication is still live", async ({ page }) => {
  await login(page, USERS.sales);

  await page.goto("/orders/new");
  await page.getByTestId("order-customer").selectOption({ index: 1 });
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  const orderPath = new URL(page.url()).pathname;

  await page.getByTestId("line-date").fill("2026-12-01");
  await page.getByTestId("line-price").fill("400");
  await page.getByTestId("add-line").click();
  await page.getByTestId("submit-order").click();
  await page.getByTestId("approve-order").click();
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

  // Completion is an accounting act, so sales does not even see the button.
  await expect(page.getByTestId("complete-order")).toHaveCount(0);

  // The accountant sees it, and is refused: the publication is still `planned`.
  await login(page, USERS.accounting);
  await page.goto(orderPath);
  await page.getByTestId("complete-order").click();

  await expect(page.getByTestId("form-error").first()).toContainText(
    "לא ניתן לסמן את ההזמנה כהושלמה",
  );
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
});
