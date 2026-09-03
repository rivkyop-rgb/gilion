import { expect, test, type Page } from "@playwright/test";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
  NEWSPAPERS,
  USERS,
  addOrderLine,
  login,
  loginAsAdmin,
  pickOrderNewspaper,
} from "./helpers";

/**
 * Quantity discounts (backlog item 12).
 *
 * *"חבילות פירסום — עדיין לא הגענו להגדרות של זה?"* — defined as **"כמות
 * פרסומים במחיר מוזל"** and nothing more. The two questions left to the build
 * are answered in lib/domain/ad-package.ts: a percentage rather than a fixed
 * price, and within one newspaper.
 *
 * ── Why this file cleans up three times over ─────────────────────────────────
 * A package on the seeded newspaper discounts every other order spec that adds
 * enough lines to earn it, and those specs assert exact totals — so a stray row
 * fails a file that never heard of packages. Cleared before each test (a retry
 * does not re-run global setup), after each test (which Playwright runs even
 * when the test failed), and in global-setup for the run after a crash.
 */
const pricingUrl = `/settings/newspapers/${NEWSPAPERS.alpha}/pricing`;

async function clearPackages() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    await prisma.adOrderItem.updateMany({
      where: { package_id: { not: null } },
      data: { package_id: null },
    });
    await prisma.adPackage.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

async function definePackage(page: Page, name: string, quantity: string, percent: string) {
  await page.goto(pricingUrl);
  await page.getByTestId("package-name").fill(name);
  await page.getByTestId("package-quantity").fill(quantity);
  await page.getByTestId("package-discount").fill(percent);
  await page.getByTestId("package-add").click();
  await expect(page.getByTestId("package-list")).toContainText(name);
}

async function newDraft(page: Page): Promise<string> {
  await page.goto("/orders/new");
  await page.getByTestId("order-customer").click();
  await page.getByTestId("order-customer-list").getByRole("option").first().click();
  await page.getByTestId("create-order").click();
  await page.waitForURL(/\/orders\/c[a-z0-9]{20,}$/);
  return new URL(page.url()).pathname.split("/").pop()!;
}

/**
 * One line, on the seeded newspaper, whatever else the run has created.
 *
 * The newspaper is named rather than taken as "the first option" — other specs
 * leave newspapers behind for the rest of the run, and one of them has a
 * different grid and no price list.
 */
async function addLine(page: Page, date: string, price: string, expectedDates: number) {
  await pickOrderNewspaper(page, NEWSPAPERS.alpha);
  await addOrderLine(page, date, price, expectedDates);
}

test.describe("quantity discounts", () => {
  test.beforeEach(clearPackages);
  test.afterEach(clearPackages);

  test("a package is defined next to the price it discounts", async ({ page }) => {
    await loginAsAdmin(page);
    await definePackage(page, "חבילת 4", "4", "10");

    await page.reload();
    const list = page.getByTestId("package-list");
    await expect(list).toContainText("מ־4 פרסומים");
    await expect(list).toContainText("10%");

    // Two packages at the same threshold could not both apply, and which one
    // won would depend on nothing anyone chose.
    await page.getByTestId("package-name").fill("חבילה נוספת");
    await page.getByTestId("package-quantity").fill("4");
    await page.getByTestId("package-discount").fill("20");
    await page.getByTestId("package-add").click();
    await expect(page.getByText("כבר קיימת חבילה שמתחילה מ־4 פרסומים")).toBeVisible();
  });

  test("the discount appears the moment the quantity earns it", async ({ page }) => {
    await loginAsAdmin(page);
    await definePackage(page, "חבילת 4", "4", "10");

    await login(page, USERS.sales);
    await newDraft(page);

    await addLine(page, "2027-03-02", "1000", 1);
    await addLine(page, "2027-03-09", "1000", 2);
    await addLine(page, "2027-03-16", "1000", 3);
    // Three is not four: nothing is taken off, and nothing is promised.
    await expect(page.getByTestId("order-total")).toContainText("3,000");
    await expect(page.getByTestId("order-discount")).toHaveCount(0);

    await addLine(page, "2027-03-23", "1000", 4);
    // The fourth line earns it, and the screen says which package and how much
    // — a total lower than the lines add up to, with nothing explaining why, is
    // a number people re-check by hand and then stop trusting.
    await expect(page.getByTestId("order-discount")).toContainText("חבילת 4");
    await expect(page.getByTestId("order-discount")).toContainText("10%");
    await expect(page.getByTestId("order-total")).toContainText("3,600");
  });

  test("approval freezes it, and retiring the package afterwards changes nothing", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await definePackage(page, "חבילת 4", "4", "10");

    const id = await newDraft(page);
    await addLine(page, "2027-04-06", "1000", 1);
    await addLine(page, "2027-04-13", "1000", 2);
    await addLine(page, "2027-04-20", "1000", 3);
    await addLine(page, "2027-04-27", "1000", 4);
    await expect(page.getByTestId("order-total")).toContainText("3,600");

    await page.getByTestId("submit-order").click();
    await page.getByTestId("approve-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

    // The publications carry the NET price: a publication is a debt, and
    // everything that reads that number has to be right about what is owed
    // without knowing packages exist.
    const rows = page.locator('[data-testid="publications-preview"] tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("900");

    // FR-17 / conventions.md §7 rule 1, applied to the discount as well as to
    // the price: the order no longer depends on the package table at all.
    await page.goto(pricingUrl);
    const toggle = page.locator('[data-testid^="package-toggle-"]');
    await toggle.click();
    await expect(page.getByTestId("package-list")).toContainText("לא בשימוש");

    await page.goto(`/orders/${id}`);
    await expect(page.getByTestId("order-total")).toContainText("3,600");
    await expect(page.getByTestId("order-discount")).toContainText("חבילת 4");
  });

  test("a package an order already earned is retired, never deleted", async ({ page }) => {
    await loginAsAdmin(page);
    await definePackage(page, "חבילת 4", "4", "10");

    await newDraft(page);
    await addLine(page, "2027-05-04", "1000", 1);
    await addLine(page, "2027-05-11", "1000", 2);
    await addLine(page, "2027-05-18", "1000", 3);
    await addLine(page, "2027-05-25", "1000", 4);
    await page.getByTestId("submit-order").click();
    await page.getByTestId("approve-order").click();
    await expect(page.getByTestId("order-status")).toHaveText("מאושרת");

    // Deleting it would leave the frozen percentage on the lines with nothing
    // naming it — the discount would survive and the reason for it would not.
    await page.goto(pricingUrl);
    await expect(page.locator('[data-testid^="package-used-"]')).toContainText("4 שורות הזמנה");
    await expect(page.locator('[data-testid^="package-delete-"]')).toHaveCount(0);
  });
});
