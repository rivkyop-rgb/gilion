import { expect, test } from "@playwright/test";
import { ROLE_LABELS } from "../lib/auth/labels";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { USERS, login } from "./helpers";

/**
 * Every test starts from the built-in defaults.
 *
 * These specs change a cell and change it back, so on a clean pass they leave
 * nothing behind — but a test that fails between those two steps does, and the
 * RETRY then begins from a matrix nobody chose. Clearing in global-setup is
 * not enough for that: it runs once per suite, not once per attempt.
 *
 * Done against the database rather than through the screen so it costs no
 * sign-in, which is the thing that made this file fragile to begin with.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

test.beforeEach(async () => {
  await prisma.rolePermission.deleteMany({});
});

/**
 * Cleaning up AFTER matters more than cleaning up before.
 *
 * Before-only was not enough: a test that failed before restoring its cell
 * left the override behind, and every spec that runs later inherited it.
 * `role-nav` then failed asserting that a designer cannot reach billing —
 * which is exactly what a leaked `designer × billing` override makes false.
 * One leaked row took five specs down with it and looked like five separate
 * regressions.
 */
test.afterEach(async () => {
  await prisma.rolePermission.deleteMany({});
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A sidebar entry, whether it renders as a link or as a disabled span. */
const navItem = (page: import("@playwright/test").Page, label: string) =>
  page.getByRole("navigation", { name: "ניווט ראשי" }).getByText(label, { exact: true });

/**
 * Editing what each role may do (FR-8).
 *
 * FR-8 fixes the five roles and calls the designer's lack of payment access a
 * DEFAULT. This screen changes the defaults for one business; it does not
 * create roles, which prd.md §181 puts outside the MVP.
 *
 * The test that matters most is the last one: a change here must actually
 * change what the server allows, not merely what the menu shows.
 */
test.describe("who may edit permissions", () => {
  test("sales cannot reach the screen", async ({ page }) => {
    await login(page, USERS.sales);
    await page.goto("/settings/permissions");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("an admin sees the matrix, with the closed cells absent", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/permissions");

    const matrix = page.getByTestId("permission-matrix");
    await expect(matrix).toBeVisible();

    // Asserted on the header cells, not as substrings of the whole table:
    // "לקוחות" (the customers AREA) contains "לקוח" (the customer ROLE), so a
    // substring check would have reported the column present when it is not.
    const headers = await matrix.locator("thead th").allInnerTexts();
    expect(headers).toEqual([
      "אזור",
      ROLE_LABELS.admin,
      ROLE_LABELS.sales,
      ROLE_LABELS.designer,
      ROLE_LABELS.accounting,
    ]);

    const rows = await matrix.locator("tbody tr td:first-child").allInnerTexts();
    expect(rows).not.toContain("פורטל לקוח");
    expect(rows).not.toContain("ניהול עסקים");
    expect(rows).toContain("גבייה ותשלומים");
  });

  test("admin's write access to settings is locked, not merely discouraged", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/settings/permissions");
    await expect(page.getByTestId("cell-admin:settings")).toBeDisabled();
  });
});

/**
 * These use one context per person instead of signing the same page in and out.
 *
 * Repeated sign-ins were the single most fragile thing in this file — each one
 * is a real credentials round trip, and a test that did five of them failed
 * far more often than the feature it was testing ever did. Two contexts, two
 * sign-ins, and each person simply reloads to see the other's change.
 */
test.describe("a change takes effect on the server, not only in the menu", () => {
  test("granting a designer read access to billing really opens it", async ({ browser }) => {
    const adminCtx = await browser.newContext({ locale: "he-IL" });
    const designerCtx = await browser.newContext({ locale: "he-IL" });
    const admin = await adminCtx.newPage();
    const designer = await designerCtx.newPage();

    try {
      await login(admin, USERS.admin);
      await login(designer, USERS.designer);

      // Before: the default refuses (FR-8).
      await designer.goto("/billing");
      await expect(designer.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
      await expect(navItem(designer, "גבייה ותשלומים")).toHaveCount(0);

      await admin.goto("/settings/permissions");
      await admin.getByTestId("cell-designer:billing").selectOption("read");
      await admin.getByTestId("save-permissions").click();
      await expect(admin.getByRole("status")).toContainText("ההרשאות נשמרו");
      await expect(admin.getByTestId("override-count")).toContainText("1 הרשאות שונו");

      // After: the route opens AND the menu agrees — no new sign-in needed,
      // which is itself the claim: the change reaches a session already open.
      await designer.goto("/billing");
      await expect(designer.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toHaveCount(
        0,
      );
      // Billing is a stage-08 area, so the sidebar shows it as a DISABLED span
      // rather than a link. Matching on text covers both.
      await expect(navItem(designer, "גבייה ותשלומים")).toBeVisible();

      // Put it back, and confirm the refusal returns.
      await admin.getByTestId("reset-defaults").click();
      await admin.getByTestId("save-permissions").click();
      await expect(admin.getByTestId("override-count")).toContainText("ברירת המחדל");

      await designer.goto("/billing");
      await expect(designer.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
    } finally {
      await adminCtx.close();
      await designerCtx.close();
    }
  });

  test("removing an area also removes it from the menu", async ({ browser }) => {
    const adminCtx = await browser.newContext({ locale: "he-IL" });
    const salesCtx = await browser.newContext({ locale: "he-IL" });
    const admin = await adminCtx.newPage();
    const sales = await salesCtx.newPage();

    try {
      await login(admin, USERS.admin);
      await login(sales, USERS.sales);
      await expect(navItem(sales, "לקוחות")).toBeVisible();

      await admin.goto("/settings/permissions");
      await admin.getByTestId("cell-sales:customers").selectOption("none");
      await admin.getByTestId("save-permissions").click();
      await expect(admin.getByRole("status")).toContainText("ההרשאות נשמרו");

      await sales.goto("/customers");
      await expect(sales.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
      await expect(navItem(sales, "לקוחות")).toHaveCount(0);

      await admin.getByTestId("reset-defaults").click();
      await admin.getByTestId("save-permissions").click();
      await expect(admin.getByTestId("override-count")).toContainText("ברירת המחדל");

      await sales.goto("/customers");
      await expect(navItem(sales, "לקוחות")).toBeVisible();
    } finally {
      await adminCtx.close();
      await salesCtx.close();
    }
  });

  test("one business's change does not touch another's", async ({ browser }) => {
    const alphaCtx = await browser.newContext({ locale: "he-IL" });
    const betaCtx = await browser.newContext({ locale: "he-IL" });
    const alpha = await alphaCtx.newPage();
    const beta = await betaCtx.newPage();

    try {
      await login(alpha, USERS.admin);
      await login(beta, USERS.betaAdmin);

      await alpha.goto("/settings/permissions");
      await alpha.getByTestId("cell-designer:billing").selectOption("write");
      await alpha.getByTestId("save-permissions").click();
      await expect(alpha.getByRole("status")).toContainText("ההרשאות נשמרו");

      // The other publisher sees untouched defaults — overrides are per tenant.
      await beta.goto("/settings/permissions");
      await expect(beta.getByTestId("override-count")).toContainText("ברירת המחדל");

      await alpha.getByTestId("reset-defaults").click();
      await alpha.getByTestId("save-permissions").click();
      await expect(alpha.getByTestId("override-count")).toContainText("ברירת המחדל");
    } finally {
      await alphaCtx.close();
      await betaCtx.close();
    }
  });
});
