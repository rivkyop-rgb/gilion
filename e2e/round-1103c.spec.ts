import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { ISSUE_FIXTURES, boardUrl, resetFixtureIssue } from "./issue-helpers";

/**
 * Round three of 03/11/2026: a ready message to a customer whose file does not
 * fit, last season's advertisers in the reports, one-click reminders, a tour
 * on every screen, and a board without the draft/in-work status.
 */

const prisma = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

test("a file that does not fit: the advice, the message and the customer's page", async ({
  page,
}) => {
  const db = prisma();
  const ad = await db.advertisement.findUniqueOrThrow({
    where: { id: ISSUE_FIXTURES.adOk },
    select: { content_width: true, content_height: true },
  });
  // A very wide file — no quarter page has that shape.
  await db.advertisement.update({
    where: { id: ISSUE_FIXTURES.adOk },
    data: { content_width: 3000, content_height: 200 },
  });
  try {
    await loginAsAdmin(page);
    await page.goto("/publications/misfit");
    const send = page.locator('[data-testid^="misfit-send-"]').first();
    await expect(send).toBeVisible();
    await expect(page.locator('[data-testid^="misfit-advice-"]').first()).toContainText("הוזמן");

    // WhatsApp or mail, whichever the fixture customer has — both carry the
    // message with the link in it and no field left unfilled.
    const link = send.locator('a[href^="https://wa.me/"], a[href^="mailto:"], a[href*="mail.google.com"]').first();
    const href0 = (await link.getAttribute("href"))!;
    const text = decodeURIComponent(href0);
    expect(text).toContain("/api/ad-view/");
    expect(text).not.toMatch(/\{[^}]+\}/);

    // The link the customer gets opens without signing in.
    const href = await page.locator('[data-testid^="misfit-view-"]').first().getAttribute("href");
    const context = await page.context().browser()!.newContext();
    const anon = await context.newPage();
    await anon.goto(href!.startsWith("http") ? href! : new URL(href!, page.url()).toString());
    await expect(anon.locator("body")).toContainText("השטח שהוזמן");
    const res = await anon.request.get(new URL(`${href}/x`, page.url()).toString());
    expect(res.status()).toBe(404);
    await context.close();
  } finally {
    await db.advertisement.update({ where: { id: ISSUE_FIXTURES.adOk }, data: ad });
    await db.$disconnect();
  }
});

test("reports: who advertised in a period, with a message to ask again", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/reports?tab=winback&period=custom&from=2026-01-01&to=2028-12-31&returned=1");
  await expect(page.getByTestId("tab-winback")).toBeVisible();
  await expect(page.getByTestId("winback-table")).toBeVisible();
  const link = page.getByTestId("winback-table").locator('a[href^="https://wa.me/"]').first();
  const text = decodeURIComponent((await link.getAttribute("href"))!.split("?text=")[1]!);
  expect(text).toContain("לפרסם שוב");
});

test("every screen has a tour, and the guide opens at its section", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/reminders");
  await page.getByTestId("help-button").click();
  await page.getByTestId("help-start-tour").click();
  await expect(page.getByTestId("guided-tour")).toContainText("איך שולחים");

  await page.goto("/billing");
  await page.getByTestId("help-button").click();
  await page.getByRole("link", { name: "מדריך שימוש" }).click();
  await expect(page).toHaveURL(/\/help#billing$/);
});

test("the board names no draft status and offers no button to change it", async ({ page }) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);
  await expect(page.getByTestId("board-header")).toBeVisible();
  await expect(page.getByTestId("board-status")).toHaveCount(0);
  await expect(page.getByTestId("set-status-in_layout")).toHaveCount(0);
  await expect(page.getByTestId("set-status-draft")).toHaveCount(0);
});
