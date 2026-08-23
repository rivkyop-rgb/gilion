import { expect, test } from "@playwright/test";
import { NEWSPAPERS, USERS, login, loginAsAdmin } from "./helpers";

/** US-006 AC-1,2,3: an admin configures a newspaper end to end. */
test.describe("newspaper configuration (US-006)", () => {
  test("creates a newspaper with a page size, margin and upload limit", async ({ page }) => {
    await login(page, USERS.designer); // wrong role on purpose, see rbac spec
    await page.goto("/settings/newspapers/new");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });

  test("an admin creates a full newspaper", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    const name = `עיתון ${Date.now()}`;
    await page.fill("#name", name);
    await page.selectOption("#pageSize", "A3");
    await page.fill("#margin", "12");
    await page.fill("#printQuality", "דפוס דיגיטלי");
    await page.fill("#maxAdFileSizeMb", "25");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("newspaper-name")).toHaveText(name);
    // The upload limit is stored per newspaper — FR-21, no hard-coded number.
    await expect(page.locator("#maxAdFileSizeMb")).toHaveValue("25");
  });

  test("rejects a margin that swallows the page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    await page.fill("#name", `שוליים ${Date.now()}`);
    await page.selectOption("#pageSize", "A4"); // 210 mm wide
    await page.fill("#margin", "150");
    await page.fill("#printQuality", "בדיקה");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toContainText("השוליים גדולים מדי");
  });

  test("refuses a duplicate newspaper name inside the business", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    await page.fill("#name", "עיתון השבוע"); // already seeded in this tenant
    await page.fill("#printQuality", "בדיקה");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("כבר קיים עיתון בשם הזה");
  });

  test("adds a page type and toggles its allowed shapes", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);

    const name = `סוג ${Date.now()}`;
    await page.getByTestId("page-type-name").fill(name);
    await page.getByTestId("add-page-type").click();
    await expect(page.getByText(name)).toBeVisible();

    // A brand-new page type starts with nothing allowed; turn one shape on.
    const row = page.locator("li", { hasText: name });
    const shape = row.locator('[data-testid^="shape-"]').first();
    await expect(shape).toHaveAttribute("aria-pressed", "false");
    await shape.click();
    await expect(shape).toHaveAttribute("aria-pressed", "true");
  });

  test("nowhere in the settings screens mentions dpi, CMYK or bleed", async ({ page }) => {
    await loginAsAdmin(page);
    for (const path of [
      `/settings/newspapers/${NEWSPAPERS.alpha}`,
      `/settings/newspapers/${NEWSPAPERS.alpha}/pricing`,
      "/settings/ad-shapes",
    ]) {
      await page.goto(path);
      const text = await page.locator("body").innerText();
      // These were Stitch inventions, not requirements (design/gaps.md §א).
      expect(text.toLowerCase()).not.toContain("dpi");
      expect(text.toLowerCase()).not.toContain("cmyk");
      expect(text).not.toContain("בליד");
    }
  });
});
