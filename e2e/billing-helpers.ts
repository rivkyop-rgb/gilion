import { expect, type Page } from "@playwright/test";

import {
  NEWSPAPERS,
  addOrderLine,
  pickOrderNewspaper,
  passOrderWarnings,
  saveCustomer,
} from "./helpers";

/**
 * Fixtures for the payment specs (stage 08).
 *
 * Every spec here builds its OWN customer and its own order, and that is not
 * politeness — the billing screen is nothing but SUMS. A total asserted against
 * a seeded customer is a total over every order any other spec happened to open
 * for them: correct, unstable, and failing in a file that never touched money.
 * global-setup removes customers with generated ids, so one per run accumulates
 * nothing.
 */

/**
 * Dates nothing else in the suite uses.
 *
 * CLAUDE.md: a publication lands on a board by (newspaper, date) alone, so a
 * date shared with another spec's fixtures adds rows to a board somebody else
 * is counting — and the failure appears over there, as "expected 6, got 9".
 * 2028 is untouched by the rest of the suite, and these are Tuesdays, which is
 * `paper_alpha`'s print day, so no line here is an off-schedule special edition.
 */
export const BILLING_DATES = {
  /** Three insertions in one month — what the monthly report sums. */
  march: ["2028-03-07", "2028-03-14", "2028-03-21"],
  /** In the NEXT month, so the weekly and monthly views disagree on purpose. */
  april: "2028-04-04",
} as const;

/** The week containing BILLING_DATES.march[0] — Sunday through Saturday. */
export const MARCH_FIRST_WEEK = { anchor: "2028-03-07", from: "2028-03-05", to: "2028-03-11" };

export async function createCustomer(
  page: Page,
  prefix: string,
): Promise<{
  id: string;
  name: string;
}> {
  const name = `${prefix} ${Date.now()}`;
  await page.goto("/customers/new");
  await page.fill("#businessName", name);
  await page.fill("#phone", "050-1112233");
  await saveCustomer(page);
  // The id pattern must exclude "new": a bare [a-z0-9]+ matches /customers/new
  // too, and the wait would return before the navigation with "new" as the id.
  await page.waitForURL(/\/customers\/c[a-z0-9]{20,}$/);
  return { id: page.url().split("/").pop()!, name };
}

/**
 * An approved order with one line per date, at `price` each.
 *
 * Approved and not a draft, because only approved orders create publications
 * and only publications are billed. The newspaper is pinned by NAME rather than
 * taken as "the first option": specs create newspapers, so first place moves as
 * the suite runs (CLAUDE.md).
 */
export async function approvedOrder(
  page: Page,
  customerLabel: string,
  dates: readonly string[],
  price: string,
  /** Pinned when the publication has to fit a particular page of a fixture issue. */
  line?: { pageTypeId: string; shapeId: string },
): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page
    .getByTestId("order-customer-list")
    .getByRole("option")
    .filter({ hasText: customerLabel })
    .first()
    .click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  const orderId = page.url().split("/").pop()!;

  await pickOrderNewspaper(page, NEWSPAPERS.alpha);
  if (line) {
    await page.getByTestId("line-page-type").selectOption(line.pageTypeId);
    await page.getByTestId("line-shape").selectOption(line.shapeId);
  }
  for (const [index, date] of dates.entries()) {
    await addOrderLine(page, date, price, index + 1);
  }

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await page.getByTestId("approve-order").click();
  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  return orderId;
}

/** Opens one customer's row on the billing screen, by URL rather than by click. */
export async function openBillingRow(page: Page, customerId: string) {
  await page.goto(`/billing?customer=${customerId}`);
  await expect(page.getByTestId(`billing-open-${customerId}`)).toBeVisible();
}

/**
 * Records one payment and waits for something only the SERVER can have made true.
 *
 * Not for the form to clear — that is client state and is true before the write
 * lands. The confirmation line carries the order's DERIVED status, which only
 * exists after the transaction committed (CLAUDE.md: after an action that
 * writes, wait for something that can only be true once it returned).
 */
export async function recordPayment(
  page: Page,
  values: { amount: string; date?: string; invoice?: string; orderId?: string },
) {
  // Invoices are ticked, several if need be (31/10/2026); ticking types the
  // open sum into the amount, and the fill below replaces it.
  if (values.orderId) {
    await page.getByTestId(`payment-invoice-${values.orderId}`).check();
  }
  await page.getByTestId("payment-amount").fill(values.amount);
  if (values.date) await page.getByTestId("payment-date").fill(values.date);
  if (values.invoice) await page.getByTestId("payment-invoice").fill(values.invoice);
  await page.getByTestId("save-payment").click();
  await expect(page.getByTestId("payment-note")).toBeVisible({ timeout: 15_000 });
}

/**
 * Unfolds the per-order breakdown inside an open customer panel.
 *
 * The panel leads with MONTHS now — that is the shape the question has — and
 * the order-level table is behind a disclosure. A spec that asserts on an
 * order row has to open it first.
 */
export async function openOrderBalances(page: Page) {
  const toggle = page.getByTestId("toggle-order-balances");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.locator("[data-testid^='order-balance-']").first()).toBeVisible();
}
