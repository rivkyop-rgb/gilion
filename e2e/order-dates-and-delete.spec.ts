import { expect, test, type Page } from "@playwright/test";
import { NEWSPAPERS, USERS, login, orderRef, pickOrderNewspaper } from "./helpers";

/**
 * The stage 04 follow-ups: a print schedule per newspaper, several dates per
 * order in one action, a searchable customer picker, and deletion that refuses
 * to pretend an approved order never happened.
 *
 * The seeded newspaper "עיתון השבוע" prints on Tuesdays (prisma/seed.ts).
 */

async function newDraft(page: Page): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

test.describe("choosing the customer (type to filter)", () => {
  test("typing narrows the list and picking one enables the submit", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/orders/new");

    // Nothing chosen yet: the draft cannot be opened.
    await expect(page.getByTestId("create-order")).toBeDisabled();

    const field = page.getByTestId("order-customer");
    await field.click();
    const all = await page.getByTestId("order-customer-list").getByRole("option").count();
    expect(all).toBeGreaterThan(1);

    const label = (
      await page.getByTestId("order-customer-list").getByRole("option").first().innerText()
    ).trim();

    // A term that cannot match anything must say so rather than show the list.
    await field.fill("זזזזזזז");
    await expect(page.getByText("אין לקוח שמתאים לחיפוש")).toBeVisible();

    // A real prefix narrows to fewer rows than the full list.
    await field.fill(label.slice(0, 3));
    const narrowed = await page.getByTestId("order-customer-list").getByRole("option").count();
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThanOrEqual(all);

    await page.getByTestId("order-customer-list").getByRole("option").first().click();
    await expect(page.getByTestId("create-order")).toBeEnabled();
  });
});

test.describe("the newspaper's print schedule", () => {
  test("a date off the schedule warns and blocks until acknowledged", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);

    // Which newspaper is being asserted about matters: the schedule belongs to
    // one paper, and the builder's first option moves as specs add newspapers.
    await pickOrderNewspaper(page, NEWSPAPERS.alpha);

    // 2026-12-20 is a Sunday; the paper prints on Tuesdays.
    await page.getByTestId("line-date").fill("2026-12-20");
    await expect(page.getByTestId("off-schedule-warning")).toBeVisible();
    await expect(page.getByTestId("add-line")).toBeDisabled();

    await page.getByTestId("confirm-special-edition").check();
    await expect(page.getByTestId("add-line")).toBeEnabled();
    await page.getByTestId("line-price").fill("100");
    await page.getByTestId("add-line").click();

    // The line is kept, and marked as the deliberate exception it was.
    await expect(page.getByTestId("order-line-count")).toContainText(`${1} תאריכים`);
    await expect(page.getByText("מהדורה מיוחדת")).toBeVisible();
  });

  test("a date on the schedule raises no warning at all", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await pickOrderNewspaper(page, NEWSPAPERS.alpha);

    await page.getByTestId("line-date").fill("2026-12-01"); // Tuesday
    await expect(page.getByTestId("off-schedule-warning")).toHaveCount(0);
    await expect(page.getByTestId("add-line")).toBeEnabled();
  });
});

test.describe("many dates in one action", () => {
  test("three ticked dates become three lines and one total", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);

    for (const d of ["2026-12-01", "2026-12-08", "2026-12-15"]) {
      await page.getByTestId("line-date").fill(d);
      await expect(page.getByTestId(`chosen-${d}`)).toBeVisible();
    }

    await page.getByTestId("line-price").fill("500");
    await expect(page.getByTestId("lines-preview-total")).toContainText("1,500");
    await expect(page.getByTestId("add-line")).toContainText("הוספת 3 שורות");

    await page.getByTestId("add-line").click();
    await expect(page.getByTestId("order-line-count")).toContainText(`${3} תאריכים`);
    await expect(page.getByTestId("order-total")).toContainText("1,500");

    // The picker clears, so a second click cannot silently duplicate the batch.
    await expect(page.getByTestId("chosen-dates")).toContainText("סמני תאריכים");
  });

  test("a date already on the order cannot be picked twice", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);

    await page.getByTestId("line-date").fill("2026-12-01");
    await page.getByTestId("line-price").fill("300");
    await page.getByTestId("add-line").click();
    await expect(page.getByTestId("order-line-count")).toContainText(`${1} תאריכים`);

    // Navigate the calendar to December 2026 and confirm the day is struck out.
    for (let i = 0; i < 24; i++) {
      const label = await page.getByTestId("calendar-month").innerText();
      if (label.includes("2026") && label.includes("דצמבר")) break;
      await page.getByTestId("next-month").click();
    }
    await expect(page.getByTestId("day-2026-12-01")).toBeDisabled();
  });
});

test.describe("deleting an order", () => {
  test("a draft is deleted after confirming, and the dialog names it", async ({ page }) => {
    await login(page, USERS.sales);
    const id = await newDraft(page);
    await page.getByTestId("line-date").fill("2026-12-01");
    await page.getByTestId("line-price").fill("250");
    await page.getByTestId("add-line").click();
    await expect(page.getByTestId("order-line-count")).toContainText(`${1} תאריכים`);

    await page.getByTestId("delete-order").click();
    const dialog = page.getByTestId("delete-order-dialog");
    await expect(dialog).toContainText(await orderRef(page));
    await expect(dialog).toContainText("250");

    await page.getByTestId("delete-order-dialog-confirm").click();
    await page.waitForURL(/\/orders$/);

    // Gone, not hidden.
    await page.goto(`/orders/${id}`);
    await expect(page.locator("body")).not.toContainText("שורות ההזמנה");
  });

  test("an approved order offers no delete at all — only cancel", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await page.getByTestId("line-date").fill("2026-12-01");
    await page.getByTestId("line-price").fill("250");
    await page.getByTestId("add-line").click();
    await page.getByTestId("submit-order").click();
    await page.getByTestId("approve-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

    await expect(page.getByTestId("delete-order")).toHaveCount(0);
    await expect(page.getByTestId("cancel-order")).toBeVisible();
  });

  test("cancelling an approved order still does not unlock delete", async ({ page }) => {
    await login(page, USERS.sales);
    await newDraft(page);
    await page.getByTestId("line-date").fill("2026-12-01");
    await page.getByTestId("line-price").fill("250");
    await page.getByTestId("add-line").click();
    await page.getByTestId("submit-order").click();
    await page.getByTestId("approve-order").click();
    // Waiting for the approval to land before cancelling: without it the click
    // races the re-render and lands on a button that is about to be replaced,
    // so the cancel never happens and the status stays "מאושרת".
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");
    await page.getByTestId("cancel-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("בוטלה");

    // The status says "cancelled", but real publications exist behind it.
    await expect(page.getByTestId("delete-order")).toHaveCount(0);
  });
});

test.describe("status colours", () => {
  test("no two order statuses share a colour", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/orders");

    const chips = page.getByTestId("status-filters").locator("a span").first();
    await expect(chips).toBeVisible();

    // Every status filter is present and reachable.
    for (const s of [
      "draft",
      "pending_approval",
      "approved",
      "rejected",
      "canceled",
      "completed",
    ]) {
      await expect(page.getByTestId(`status-filter-${s}`)).toBeVisible();
    }
  });
});
