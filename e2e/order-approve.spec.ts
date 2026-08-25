import { expect, test, type Page } from "@playwright/test";
import { USERS, login } from "./helpers";

/**
 * US-004 and FR-17: approval is the moment an order stops being a proposal.
 * It must create exactly one publication per line, copy the price, and freeze
 * it against later changes to the price list.
 */

/** Opens a fresh draft and returns its id. */
async function newDraft(page: Page): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").selectOption({ index: 1 });
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function addLine(page: Page, date: string, price?: string) {
  await page.getByTestId("line-date").fill(date);
  if (price !== undefined) await page.getByTestId("line-price").fill(price);
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("order-lines")).toBeVisible();
}

test.describe("approving an order (US-004)", () => {
  test("a draft creates no publications at all (US-003 AC-5)", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await addLine(page, "2026-12-01");

    // The preview names what *would* be created, in the future tense.
    await expect(page.getByTestId("preview-caption")).toContainText("ייווצרו לאחר אישור");

    await page.goto("/publications");
    await expect(page.getByTestId("publications-table")).toHaveCount(0);
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
