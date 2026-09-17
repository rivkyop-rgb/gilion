import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

import { BUSINESS, USERS, login } from "./helpers";

/**
 * Changing a brand colour, with no rebuild and no deploy (stage 11 DoD).
 *
 * Every settings row is torn down around each test rather than only in
 * global-setup: a run that fails between saving a colour and resetting it
 * repaints the ENTIRE product for every spec that follows, and the failure
 * would then surface in a file that never opened this screen. global-setup
 * runs once per suite, not once per attempt — the same lesson permissions.spec
 * already learned about a leaked override.
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

/** The computed colour of an element, as the browser resolves the token. */
const colorOf = (locator: import("@playwright/test").Locator, property: string) =>
  locator.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

test.describe("the palette an admin owns", () => {
  test("a saved colour is applied across the system after a reload", async ({ page }) => {
    await login(page, USERS.admin);

    await page.goto("/settings/theme");
    await expect(page.getByRole("heading", { name: "צבעים" })).toBeVisible();

    // The preview is driven by the SAME custom properties the layout writes,
    // so it moves before anything is saved. That is the point of it.
    await page.getByTestId("hex-primary").fill("#7b1fa2");
    await expect
      .poll(() => colorOf(page.getByTestId("theme-preview"), "--gilion-primary"))
      .toBe("#7b1fa2");

    await page.getByTestId("panel-save").click();
    // Wait for something that can only be true after the action RETURNED, and
    // whose number comes from the server rather than from form state.
    await expect(page.getByTestId("panel-saved")).toContainText("נשמרו 1 צבעים מותאמים");

    // The real proof: another screen entirely, after a fresh load, with no
    // build step in between.
    await page.goto("/dashboard");
    const shell = page.getByTestId("sidebar-rail").locator("xpath=ancestor::div[1]");
    await expect
      .poll(() => colorOf(shell, "--gilion-primary"))
      .toBe("#7b1fa2");

    // And PAINTED — the variable being set proves nothing on its own. Until
    // 17/09/2026 it was set here and never reached a pixel: `@theme` resolved
    // --color-primary once at :root, above the element carrying the override,
    // and this test passed the whole time. A `bg-primary` box inside the shell
    // is what a person actually sees.
    const painted = await shell.evaluate((el) => {
      const probe = document.createElement("div");
      probe.className = "bg-primary";
      el.appendChild(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    expect(painted).toBe("rgb(123, 31, 162)");
  });

  test("a colour left alone keeps following the default, and is not stored", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/theme");

    await page.getByTestId("hex-primary").fill("#7b1fa2");
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    const row = await prisma.businessSettings.findUnique({
      where: { business_id: BUSINESS.alpha },
      select: { color_overrides: true },
    });
    // Exactly one key. Storing the other fourteen at today's values would
    // freeze this business's palette against every future correction.
    expect(Object.keys(row?.color_overrides as object)).toEqual(["primary"]);
  });

  test("reset returns one colour to the default without touching the others", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/theme");

    await page.getByTestId("hex-primary").fill("#7b1fa2");
    await page.getByTestId("hex-brand-gold").fill("#00897b");
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toContainText("נשמרו 2 צבעים מותאמים");

    await page.getByTestId("reset-primary").click();
    await expect(page.getByTestId("hex-primary")).toHaveValue("#000613");
    await expect(page.getByTestId("hex-brand-gold")).toHaveValue("#00897b");

    await expect
      .poll(async () => {
        const saved = await prisma.businessSettings.findUnique({
          where: { business_id: BUSINESS.alpha },
          select: { color_overrides: true },
        });
        return Object.keys((saved?.color_overrides as object) ?? {});
      })
      .toEqual(["brand-gold"]);
  });

  test("resetting the group clears every override at once", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/theme");

    await page.getByTestId("hex-primary").fill("#7b1fa2");
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    await page.getByTestId("panel-reset-all").click();
    await expect(page.getByTestId("hex-primary")).toHaveValue("#000613");
  });

  test("a low-contrast pair warns and still saves — it is the admin's brand", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/theme");

    // Near-white text on the pale success background: legible to nobody.
    await page.getByTestId("hex-status-success-fg").fill("#f5f5f5");
    await expect(page.getByTestId("contrast-warnings")).toContainText("WCAG AA");

    await page.getByTestId("panel-save").click();
    // Saved, not refused — the warning is advice, not a gate.
    await expect(page.getByTestId("panel-saved")).toBeVisible();
    await expect(page.getByTestId("panel-warnings")).toContainText("WCAG AA");
  });

  test("an invalid hex is refused by the server with a Hebrew message", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/theme");

    await page.getByTestId("hex-primary").fill("purple");
    await page.getByTestId("panel-save").click();
    await expect(page.getByRole("main")).toContainText("אינו קוד צבע תקין");
  });

  test("one business's palette does not reach another", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/theme");
    await page.getByTestId("hex-primary").fill("#7b1fa2");
    await page.getByTestId("panel-save").click();
    await expect(page.getByTestId("panel-saved")).toBeVisible();

    // beta's admin is a different person in a different tenant (FR-1).
    await login(page, USERS.betaAdmin);
    await page.goto("/settings/theme");
    await expect(page.getByTestId("hex-primary")).toHaveValue("#000613");
  });
});
