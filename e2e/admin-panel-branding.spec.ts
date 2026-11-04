import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

import { BUSINESS, USERS, login } from "./helpers";
import { validPng } from "./ad-fixtures";

/**
 * Replacing the logo without touching the code (stage 11 DoD).
 *
 * Same teardown discipline as the theme spec: a settings row left behind
 * changes the sidebar of every other spec in the suite.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

test.beforeEach(async () => {
  await prisma.businessSettings.deleteMany({});
});
test.afterEach(async () => {
  await prisma.businessSettings.deleteMany({});
});
test.afterAll(async () => {
  await prisma.$disconnect();
});

/** An SVG carrying everything svg-sanitize.ts exists to remove. */
const hostileSvg = {
  name: "logo.svg",
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" onload="steal()">` +
      `<script>fetch('/api/files')</script>` +
      `<circle cx="20" cy="20" r="18" fill="#0044cc"/>` +
      `</svg>`,
    "utf8",
  ),
};

test.describe("the logo an admin owns", () => {
  test("an uploaded mark replaces the shipped one in the sidebar", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");

    const sidebarLogo = page.getByTestId("sidebar-rail").locator("img").first();
    // Before: the file that ships in public/brand/.
    await expect(sidebarLogo).toHaveAttribute("src", /\/brand\//);

    await page.getByTestId("brand-file-mark").setInputFiles(await validPng("mark.png"));
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toContainText("המותג נשמר");

    await page.reload();
    // After: served through the app's own file route, never from the store
    // directly (conventions.md §5).
    await expect(sidebarLogo).toHaveAttribute("src", `/api/files/${BUSINESS.alpha}/brand/mark.png`);

    // And the bytes actually come back — a broken <img> reports nothing, which
    // is exactly how every preview in the product was blank for a fortnight.
    const response = await page.request.get(`/api/files/${BUSINESS.alpha}/brand/mark.png`);
    expect(response.status()).toBe(200);
    // The bytes themselves, not the header: since Next 16.4 a streamed
    // file goes out chunked, with no Content-Length to read.
    expect((await response.body()).length).toBeGreaterThan(0);
  });

  test("the display name replaces the product name beside it", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");

    await page.getByTestId("brand-display-name").fill("הוצאת המרכז");
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("sidebar-brand-name")).toHaveText("הוצאת המרכז");
  });

  test("a hostile SVG is stripped before it is stored, and the admin is told", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");

    await page.getByTestId("brand-file-mark").setInputFiles(hostileSvg);
    await page.getByTestId("panel-save").click();

    await expect(page.getByTestId("panel-warnings")).toContainText("תוכן פעיל");

    // The claim that matters is about the BYTES, not about the message: what
    // came back from the store must contain no script and no event handler.
    const response = await page.request.get(`/api/files/${BUSINESS.alpha}/brand/mark.svg`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/onload/i);
    // The drawing itself survived — sanitising is not rejecting.
    expect(body).toContain("<circle");
  });

  test("a file the slot does not take is refused with a Hebrew message", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");

    // A 800x600 PNG is a fine mark and far too big for a 200KB favicon slot…
    // so this checks the TYPE rule instead, with a PDF renamed to .png.
    await page.getByTestId("brand-file-favicon").setInputFiles({
      name: "icon.png",
      mimeType: "image/png",
      buffer: Buffer.from("%PDF-1.7\n%not really a png", "utf8"),
    });
    await page.getByTestId("panel-save").click();
    await expect(page.getByRole("main")).toContainText("אפשר להעלות");
  });

  test("removing the upload goes back to the shipped file", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");

    await page.getByTestId("brand-file-mark").setInputFiles(await validPng("mark.png"));
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    await page.reload();
    await page.getByTestId("reset-mark").click();

    await expect(page.getByTestId("sidebar-rail").locator("img").first()).toHaveAttribute(
      "src",
      /\/brand\//,
    );
  });

  test("every change is recorded in the audit trail", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");

    await page.getByTestId("brand-display-name").fill("שם חדש");
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    const entry = await prisma.auditLog.findFirst({
      where: { business_id: BUSINESS.alpha, action: "update_business_settings" },
      orderBy: { created_at: "desc" },
    });
    expect(entry).not.toBeNull();
    // Old and new, not the whole record (conventions.md §6).
    expect(entry?.new_value).toMatchObject({ display_name: "שם חדש" });
  });

  test("one business's logo is not served to another", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/branding");
    await page.getByTestId("brand-file-mark").setInputFiles(await validPng("mark.png"));
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    await login(page, USERS.betaAdmin);
    // 404 and never 403: a refusal that distinguishes the two confirms the
    // file exists in somebody else's business.
    const response = await page.request.get(`/api/files/${BUSINESS.alpha}/brand/mark.png`);
    expect(response.status()).toBe(404);
  });
});
