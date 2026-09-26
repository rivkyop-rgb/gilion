import { expect, test, type Page } from "@playwright/test";
import {
  NEWSPAPERS,
  PAGE_TYPES,
  SHAPES,
  USERS,
  login,
  orderRef,
  passOrderWarnings,
} from "./helpers";

/**
 * Success criterion 2 of prd.md §7, mapped here by docs/plan/README.md:
 *
 *   "נציג מכירות יוצר הזמנה של 10 פרסומים, רואה תצוגה מקדימה ומאשר תוך 3 דקות"
 *
 * The three minutes are the point of the whole stage, and they are what the
 * multi-date picker exists for: ten publications used to mean ten passes
 * through the same form. Here they are ten ticks and one click.
 *
 * The budget is asserted, not just described — a regression that makes this
 * flow slow is a regression against the criterion even if every assertion
 * still passes.
 */
const BUDGET_MS = 3 * 60 * 1000;

/** Ten consecutive Tuesdays — the seeded newspaper's print day. */
const DATES = [
  "2026-12-01",
  "2026-12-08",
  "2026-12-15",
  "2026-12-22",
  "2027-01-05",
  "2027-01-12",
  "2027-01-19",
  "2027-01-26",
  "2027-02-02",
  "2027-02-09",
];

async function openDraft(page: Page): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  return page.url().split("/").pop()!;
}

test("a sales rep builds, previews and approves 10 publications well inside 3 minutes", async ({
  page,
}) => {
  const started = Date.now();

  await login(page, USERS.sales);
  await openDraft(page);

  await page.getByTestId("line-newspaper").selectOption(NEWSPAPERS.alpha);
  await page.getByTestId("line-page-type").selectOption(PAGE_TYPES.inner);
  await page.getByTestId("line-shape").selectOption(SHAPES.quarter);

  // 2026-12-29 is deliberately absent: none of the ten may fall on a chag, or
  // the criterion would be measuring the exception path instead of the flow.
  for (const d of DATES) {
    await page.getByTestId("line-date").fill(d);
    await expect(page.getByTestId(`chosen-${d}`)).toBeVisible();
  }

  await page.getByTestId("line-price").fill("500");
  // What the order will cost, before a single row is written.
  await expect(page.getByTestId("lines-preview-total")).toContainText("5,000");
  await expect(page.getByTestId("add-line")).toContainText("הוספת 10 שורות");

  // One click for all ten — the whole reason the criterion is reachable.
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("order-line-count")).toContainText(`${10} תאריכים`);
  await expect(page.getByTestId("order-total")).toContainText("5,000");

  // The preview names exactly what approval will create, in the future tense.
  await expect(page.getByTestId("preview-caption")).toContainText("10 פרסומים ייווצרו");
  await expect(page.locator('[data-testid="publications-preview"] tbody tr')).toHaveCount(10);

  await page.getByTestId("submit-order").click();

  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("ממתינה לאישור");

  await page.getByTestId("approve-order").click();

  await passOrderWarnings(page);
  await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

  // Ten binding publications, one per line, each carrying the copied price.
  await expect(page.getByTestId("preview-caption")).toContainText("10 פרסומים מחייבים נוצרו");
  const rows = page.locator('[data-testid="publications-preview"] tbody tr');
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("500");

  // Read while the order page is still open: the number is a real sequence
  // now, so it comes off the screen rather than out of the id.
  const ref = await orderRef(page);

  // And they are real: the publications list shows them under this order.
  await page.goto(`/publications?newspaper=${NEWSPAPERS.alpha}`);
  await expect(page.getByRole("link", { name: ref })).toHaveCount(10);

  expect(Date.now() - started).toBeLessThan(BUDGET_MS);
});
