import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";

import { BUSINESS, CUSTOMERS, NEWSPAPERS, SHAPES, USERS, addOrderLine, login, loginAsAdmin } from "./helpers";
import { ISSUE_FIXTURES } from "./issue-helpers";

/**
 * The round of 03/11/2026: a place in the issue per date, the designer's
 * package, publications whose date passed, and importing customers.
 *
 * Dates here are used by no other spec (CLAUDE.md: fixture dates are shared).
 */
const MISSED_DATE = "2026-02-10";
const LIVE_DATE = "2027-08-17";
const DRAFT_DATE = "2027-08-24";

function client() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
}

test("an order line asks for a place, and one date can ask for another", async ({ page }) => {
  test.slow();
  await login(page, USERS.sales);
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);

  // A page number with a flexibility of one page either way.
  await page.getByTestId("line-position-kind").selectOption("page");
  await page.getByTestId("line-requested-page").fill("2");
  await page.getByTestId("line-position-flex-mode").selectOption("pages");
  await page.getByTestId("line-position-flex").fill("1");
  await page.getByTestId("line-position-note").fill("ליד מדור הספורט");
  await addOrderLine(page, DRAFT_DATE, "500", 1);

  const group = page.locator('[data-testid^="order-line-group-"]').first();
  await expect(group.getByTestId("line-position-label")).toHaveText("עמוד 2 (± עמוד אחד)");

  // This one date moves to the middle of the issue — on its own.
  await group.locator('[data-testid^="item-position-"]').first().click();
  const dialog = page.getByTestId("item-position-dialog");
  await dialog.locator('[data-testid$="line-position-kind"]').selectOption("middle");
  await dialog.getByTestId("item-position-save").click();
  await expect(dialog).toHaveCount(0);
  // The flexibility already set travels with the new place.
  await expect(group.getByTestId("line-position-label")).toHaveText("עמוד אמצע (± עמוד אחד)");
});

test.describe("a publication whose date passed without running", () => {
  let orderId = "";
  let missedId = "";

  test.beforeEach(async () => {
    const prisma = client();
    try {
      const top = await prisma.adOrder.aggregate({
        where: { business_id: BUSINESS.alpha },
        _max: { number: true },
      });
      const order = await prisma.adOrder.create({
        data: {
          business_id: BUSINESS.alpha,
          number: (top._max.number ?? 0) + 500,
          customer_id: CUSTOMERS.alphaRegular,
          status: "approved",
          total_price: 800,
          approved_at: new Date(),
        },
      });
      orderId = order.id;
      const common = {
        business_id: BUSINESS.alpha,
        order_id: order.id,
        customer_id: CUSTOMERS.alphaRegular,
        newspaper_id: NEWSPAPERS.alpha,
        ad_shape_id: SHAPES.quarter,
        source: "internal" as const,
        status: "missing_ad" as const,
      };
      const missed = await prisma.publication.create({
        data: { ...common, publication_date: new Date(MISSED_DATE), price: 500 },
      });
      missedId = missed.id;
      await prisma.publication.create({
        data: { ...common, publication_date: new Date(LIVE_DATE), price: 300 },
      });
      // Paid in full — so cancelling the missed one leaves 500 over.
      await prisma.payment.create({
        data: {
          business_id: BUSINESS.alpha,
          customer_id: CUSTOMERS.alphaRegular,
          order_id: order.id,
          updated_by_user_id: (await prisma.user.findFirstOrThrow({ where: { email: USERS.admin } })).id,
          amount: 800,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterEach(async () => {
    const prisma = client();
    try {
      await prisma.payment.deleteMany({ where: { customer_id: CUSTOMERS.alphaRegular, OR: [{ order_id: orderId }, { order_id: null, amount: 500 }] } });
      await prisma.auditLog.deleteMany({ where: { target_id: missedId } });
      await prisma.publication.deleteMany({ where: { order_id: orderId } });
      await prisma.adOrder.deleteMany({ where: { id: orderId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("is listed, and crediting it moves what was paid on it to credit", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-missed")).toBeVisible();

    await page.goto("/publications/missed");
    await expect(page.getByTestId(`missed-row-${missedId}`)).toBeVisible();
    await page.getByTestId(`missed-credit-${missedId}`).click();
    await page.getByTestId(`missed-credit-dialog-${missedId}`).getByRole("button", { name: "ביטול וזיכוי" }).click();

    await expect(page.getByTestId("missed-note")).toContainText("500");
    await expect(page.getByTestId(`missed-row-${missedId}`)).toHaveCount(0);

    const prisma = client();
    try {
      const credit = await prisma.payment.aggregate({
        where: { customer_id: CUSTOMERS.alphaRegular, order_id: null, status: "recorded", amount: 500 },
        _count: true,
      });
      expect(credit._count).toBeGreaterThan(0);
      const onOrder = await prisma.payment.aggregate({
        where: { order_id: orderId, status: "recorded" },
        _sum: { amount: true },
      });
      expect(Number(onOrder._sum.amount)).toBe(300);
    } finally {
      await prisma.$disconnect();
    }
  });

  test("can move to another date instead", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/publications/missed");
    await page.getByTestId(`missed-move-${missedId}`).click();
    await page.getByTestId(`missed-date-${missedId}`).fill("2027-08-31");
    await page.getByTestId(`missed-move-save-${missedId}`).click();
    await expect(page.getByTestId("missed-note")).toContainText("הועבר");
    await expect(page.getByTestId(`missed-row-${missedId}`)).toHaveCount(0);
  });
});

test("the designer gets every file of an issue — as a ZIP and by a link that needs no login", async ({
  page,
  browser,
}) => {
  await loginAsAdmin(page);
  await page.goto(`/issues/${ISSUE_FIXTURES.issue}/board`);

  const download = page.waitForEvent("download");
  await page.getByTestId("designer-zip").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
  // The fixture issue holds an ad whose object is gone from storage on
  // purpose — the ZIP still comes, with the list saying which one.

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("designer-link").click();
  await expect(page.getByTestId("designer-link")).toContainText("הועתק");
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/api/layout-package/");

  // A fresh browser with no session at all.
  const outsider = await browser.newContext();
  const res = await outsider.request.get(link);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("הורדת כל הקבצים");
  // A forged signature opens nothing.
  const forged = await outsider.request.get(link.replace(/\/[^/]+$/, "/forged-token-forged-token-xxxxx"));
  expect(forged.status()).toBe(404);
  await outsider.close();
});

test("customers import from a spreadsheet: preview first, then only the rows chosen", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/customers");
  await page.getByTestId("import-customers").click();
  await expect(page).toHaveURL(/\/customers\/import$/);

  const stamp = Date.now();
  const csv =
    "﻿שם העסק,טלפון,ח.פ,איש קשר\r\n" +
    `ייבוא אלפא ${stamp},031234567,,דנה\r\n` +
    `,031234568,,\r\n` +
    `ייבוא בטא ${stamp},521234567,12,\r\n`;
  await page.getByTestId("import-file").setInputFiles({
    name: "לקוחות.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByTestId("import-preview").click();

  await expect(page.getByTestId("import-row-2")).toContainText("תקין");
  await expect(page.getByTestId("import-row-3")).toContainText("שם העסק הוא שדה חובה");
  await expect(page.getByTestId("import-row-4")).toContainText("9 ספרות");
  await expect(page.getByTestId("import-pick-3")).toBeDisabled();

  await page.getByTestId("import-run").click();
  await expect(page.getByTestId("import-result")).toContainText("לקוח אחד יובא");

  await page.goto(`/customers?q=${encodeURIComponent(`ייבוא אלפא ${stamp}`)}`);
  await expect(page.getByText(`ייבוא אלפא ${stamp}`)).toBeVisible();
});
