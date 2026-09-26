import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

import { USERS, login } from "./helpers";

/**
 * The business chooses whether an office order needs a separate approval
 * (Business.internal_orders_need_approval, 25/09/2026), and moving an order
 * forward without artwork asks first — twice when the paper prints this week.
 *
 * global-setup turns the approval step ON for every suite; this one turns it
 * off for itself and always puts it back, or every order spec after it would
 * find "אישור" where it expects "שליחה לאישור".
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const setApproval = (value: boolean) =>
  prisma.business.update({
    where: { id: "biz_alpha" },
    data: { internal_orders_need_approval: value },
  });

test.beforeEach(async () => {
  await setApproval(false);
});
test.afterEach(async () => {
  await setApproval(true);
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

async function draftWithLine(page: Page, date: string) {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  await page.getByTestId("line-date").fill(date);
  await page.getByTestId("line-price").fill("500");
  const offSchedule = page.getByTestId("off-schedule-warning");
  if (await offSchedule.isVisible()) await page.getByTestId("confirm-special-edition").check();
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("order-lines")).toBeVisible();
}

/** Two days from now, as the date field speaks it. */
const soon = () => new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

test.describe("direct approval and the missing-artwork warnings", () => {
  test("a draft offers 'אישור' and no 'שליחה לאישור' when the business chose it", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    // A Tuesday of its own, far from every fixture date (CLAUDE.md: fixture
    // dates are shared, and a publication lands on a board by date alone).
    await draftWithLine(page, "2028-02-01");

    await expect(page.getByTestId("submit-order")).toHaveCount(0);
    await page.getByTestId("approve-order").click();

    await expect(page.getByTestId("order-warn-no-ad")).toContainText("לאשר בלי מודעה?");
    await page.getByTestId("order-warn-no-ad-confirm").click();
    // Far from this week: no second warning, straight to approved.
    await expect(page.getByTestId("order-warn-soon")).toHaveCount(0);
    await expect(page.getByTestId("publications-preview")).toBeVisible();
    await expect(page.getByTestId("preview-caption")).toContainText("נוצר");
  });

  test("this week's paper asks a second, separate time — and cancelling writes nothing", async ({
    page,
  }) => {
    await login(page, USERS.admin);
    await draftWithLine(page, soon());

    await page.getByTestId("approve-order").click();
    await page.getByTestId("order-warn-no-ad-confirm").click();

    await expect(page.getByTestId("order-warn-soon")).toContainText("העיתון יורד לדפוס");
    await page.getByTestId("order-warn-soon").getByRole("button", { name: "ביטול" }).click();

    // Still a draft: nothing was approved behind the dialog.
    await page.reload();
    await expect(page.getByTestId("approve-order")).toBeVisible();
    await expect(page.getByTestId("preview-caption")).toContainText("ייווצר");
  });

  test("the setting lives in the admin panel", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/orders");
    await page.getByTestId("orders-approval-required").click();
    await page.getByTestId("save-orders-approval").click();
    await expect(page.getByTestId("orders-approval-saved")).toBeVisible();

    const row = await prisma.business.findUnique({
      where: { id: "biz_alpha" },
      select: { internal_orders_need_approval: true },
    });
    expect(row?.internal_orders_need_approval).toBe(true);
  });
});
