import { expect, test, type Page } from "@playwright/test";
import { NEWSPAPERS, PAGE_TYPES, SHAPES, USERS, login } from "./helpers";

/**
 * US-004 and FR-17: approval is the moment an order stops being a proposal.
 * It must create exactly one publication per line, copy the price, and freeze
 * it against later changes to the price list.
 */

/** Opens a fresh draft and returns its id. */
async function newDraft(page: Page): Promise<string> {
  await page.goto("/orders/new");
  // The customer picker filters as you type — there is no <select> to choose
  // an index from. Focusing opens the full list; the first option is taken.
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/**
 * A price is always supplied: the default combination in the builder has no
 * PriceRule behind it, so leaving the field empty is a legitimate rejection
 * (rule 4) rather than a way to add a line. That path has its own test below.
 */
async function addLine(page: Page, date: string, price: string) {
  await page.getByTestId("line-date").fill(date);
  await page.getByTestId("line-price").fill(price);
  // Every date in these specs is a Tuesday or not — the seeded newspaper prints
  // on Tuesdays, so anything else needs the special-edition acknowledgement.
  const warning = page.getByTestId("off-schedule-warning");
  if (await warning.isVisible()) await page.getByTestId("confirm-special-edition").check();
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("order-lines")).toBeVisible();
}

test.describe("approving an order (US-004)", () => {
  test("a draft creates no publications at all (US-003 AC-5)", async ({ page }) => {
    await login(page, USERS.sales);
    const id = await newDraft(page);
    await addLine(page, "2026-12-01", "1200");

    // The preview names what *would* be created, in the future tense.
    await expect(page.getByTestId("preview-caption")).toContainText("ייווצרו לאחר אישור");

    // Assert on *this* draft rather than on an empty table: other specs leave
    // approved orders behind, and a global count would only measure them.
    const orderRef = `ORD-${id.slice(-6).toUpperCase()}`;
    await page.goto("/publications");
    await expect(page.getByText(orderRef)).toHaveCount(0);
  });

  test("approval creates one publication per line and copies the price", async ({ page }) => {
    await login(page, USERS.sales);
    const id = await newDraft(page);

    await addLine(page, "2026-12-01", "1200");
    await addLine(page, "2026-12-08", "800");
    await expect(page.locator('[data-testid="order-lines"] tbody tr')).toHaveCount(2);
    await expect(page.getByTestId("order-total")).toContainText("2,000");

    await page.getByTestId("submit-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("ממתינה לאישור");

    await page.getByTestId("approve-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
    await expect(page.getByTestId("preview-caption")).toContainText("2 פרסומים מחייבים נוצרו");

    // The publications carry the line prices, not a recomputed number.
    const rows = page.locator('[data-testid="publications-preview"] tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("1,200");

    await page.goto(`/orders/${id}`);
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
  });

  test("clicking approve twice does not double the publications", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-15", "500");
    await page.getByTestId("submit-order").click();
    await expect(page.getByTestId("approve-order")).toBeVisible();

    await page.getByTestId("approve-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

    // The button is gone, so the second attempt goes through the action directly
    // — which is what a double click races with. The unique index on
    // order_item_id is what makes it harmless.
    await page.reload();
    await expect(page.locator('[data-testid="publications-preview"] tbody tr')).toHaveCount(1);
  });

  test("an approved order can no longer be edited", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-20", "300");
    await page.getByTestId("submit-order").click();
    await page.getByTestId("approve-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

    await expect(page.getByTestId("add-line")).toHaveCount(0);
    await expect(page.getByTestId("submit-order")).toHaveCount(0);
    await expect(page.getByTestId("approve-order")).toHaveCount(0);
  });
});

/**
 * These two assert on the BASE PRICE, so they must stand on a combination that
 * actually has one. Relying on whatever the builder selects by default made
 * them depend on sort order across the whole tenant: another spec adds a page
 * type to the seeded newspaper, it sorts first, and the default combination
 * silently becomes one with no PriceRule behind it. Selecting explicitly is
 * both what the test means and what makes it immune to that.
 */
async function selectPricedCombination(page: Page) {
  await page.getByTestId("line-newspaper").selectOption(NEWSPAPERS.alpha);
  await page.getByTestId("line-page-type").selectOption(PAGE_TYPES.inner);
  // The quarter page is the combination prisma/seed.ts gives a PriceRule.
  await page.getByTestId("line-shape").selectOption(SHAPES.quarter);
}

test.describe("where the price comes from (rule 4)", () => {
  test("an empty price falls back to the base price from the list", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await selectPricedCombination(page);

    // The builder shows which of the two it is before anything is saved.
    await expect(page.getByTestId("price-origin")).toHaveText("מחיר בסיסי");
    const suggested = await page.getByTestId("line-price").inputValue();
    expect(Number(suggested)).toBeGreaterThan(0);

    await page.getByTestId("line-date").fill("2026-12-01");
    await page.getByTestId("line-price").fill("");
    await page.getByTestId("add-line").click();

    await expect(page.locator('[data-testid="order-lines"] tbody tr')).toHaveCount(1);
    await expect(page.getByTestId("order-total")).toContainText(
      Number(suggested).toLocaleString("he-IL"),
    );
  });

  test("typing over the suggestion keeps the typed number", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await selectPricedCombination(page);

    // Typed immediately, racing the suggestion request. This is the exact
    // regression that produced two lines of 800 when 1200 and 800 were typed:
    // the suggestion landed afterwards and overwrote the number.
    await page.getByTestId("line-price").fill("1234");

    // Once the suggestion has landed the field must still hold what was typed,
    // and the label must say it differs from the base price.
    await expect(page.getByTestId("price-origin")).toHaveText("מחיר מותאם");
    await expect(page.getByTestId("line-price")).toHaveValue("1234");

    await page.getByTestId("line-date").fill("2026-12-01");
    await page.getByTestId("add-line").click();

    await expect(page.getByTestId("order-total")).toContainText("1,234");
  });

  test("zero is accepted — a free placement is a decision, not a missing price", async ({
    page,
  }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-01", "0");

    await expect(page.locator('[data-testid="order-lines"] tbody tr')).toHaveCount(1);
  });
});

test.describe("rejecting an order (FR-19)", () => {
  test("rejects with a reason, and the reason is shown", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-01", "100");
    await page.getByTestId("submit-order").click();

    await page.getByTestId("open-reject").click();
    await page.getByTestId("reject-reason").fill("התאריך כבר מלא");
    await page.getByTestId("confirm-reject").click();

    await expect(page.getByTestId("order-status")).toHaveText("נדחתה");
    await expect(page.getByText("התאריך כבר מלא")).toBeVisible();
  });

  test("rejects with no reason at all — the reason is optional", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-01", "100");
    await page.getByTestId("submit-order").click();

    await page.getByTestId("open-reject").click();
    await page.getByTestId("confirm-reject").click();

    await expect(page.getByTestId("order-status")).toHaveText("נדחתה");
  });

  test("a rejected order cannot then be approved", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-01", "100");
    await page.getByTestId("submit-order").click();
    await page.getByTestId("open-reject").click();
    await page.getByTestId("confirm-reject").click();
    await expect(page.getByTestId("order-status")).toHaveText("נדחתה");

    await expect(page.getByTestId("approve-order")).toHaveCount(0);
  });
});
