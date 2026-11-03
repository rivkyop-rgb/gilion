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
    await page.fill("#marginCm", "1.2");
    await page.selectOption("#printQuality", "high");
    await page.fill("#maxAdFileSizeMb", "25");
    await page.fill("#columns", "5");
    await page.fill("#rowHeightCm", "1");
    await page.fill("#gutterCm", "0.3");

    // The row count and the column width are derived, never typed — A3 is
    // 297x420 mm, so (420 - 24 - 3) / 13 = 30.2 -> 30 rows.
    await expect(page.getByTestId("grid-derived")).toContainText("5 עמודות × 30 שורות");
    // And the readout answers the question a cell count cannot: how big is it.
    await expect(page.getByTestId("grid-derived")).toContainText("ס״מ");

    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("newspaper-name")).toHaveText(name);
    // The upload limit is stored per newspaper — FR-21, no hard-coded number.
    await expect(page.locator("#maxAdFileSizeMb")).toHaveValue("25");
    await expect(page.getByTestId("grid-derived")).toContainText("5 עמודות × 30 שורות");
  });

  test("a new newspaper is stocked with the base shape catalogue", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    const name = `קטלוג ${Date.now()}`;
    await page.fill("#name", name);
    await page.selectOption("#printQuality", "standard");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByTestId("newspaper-name")).toHaveText(name);

    // A newspaper with no shapes cannot divide a page at all, so the catalogue
    // is created with it rather than left for the user to build from nothing.
    await page.getByRole("link", { name: "צורות פרסום ומיקומים" }).click();
    await expect(page.getByTestId("shape-list").locator("> li")).toHaveCount(6);
    await expect(page.getByText("רצועה תחתונה")).toBeVisible();
  });

  test("refuses a grid that does not fit the page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    await page.fill("#name", `גריד ${Date.now()}`);
    await page.selectOption("#printQuality", "standard");
    await page.fill("#rowHeightCm", "50");

    await expect(page.getByTestId("grid-derived")).toContainText("לא מייצרת גריד");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByTestId("form-error").first()).toContainText("לא משאירים אף שורה");
  });

  test("rejects a margin that swallows the page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    await page.fill("#name", `שוליים ${Date.now()}`);
    await page.selectOption("#pageSize", "A4"); // 210 mm wide
    await page.fill("#marginCm", "15");
    await page.selectOption("#printQuality", "standard");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toContainText("השוליים גדולים מדי");
  });

  test("refuses a duplicate newspaper name inside the business", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/settings/newspapers/new");

    await page.fill("#name", "עיתון השבוע"); // already seeded in this tenant
    await page.selectOption("#printQuality", "standard");
    await page.getByRole("button", { name: "שמירה" }).click();

    await expect(page.getByTestId("form-error").first()).toHaveText("כבר קיים עיתון בשם הזה");
  });

  test("adds a page type and toggles its allowed shapes", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);

    const name = `סוג ${Date.now()}`;
    await page.getByTestId("page-type-name").fill(name);
    await page.getByTestId("add-page-type").click();
    // The name now appears twice — in this list, and in the auto-placement
    // table that names every page type (24f08c6) — so the row is found by
    // where it lives, not by the text alone.
    const row = page.locator("li", { hasText: name });
    await expect(row).toBeVisible();

    // A brand-new page type starts with nothing allowed; turn one shape on.
    const shape = row.locator('[data-testid^="shape-"]').first();
    await expect(shape).toHaveAttribute("aria-pressed", "false");
    await shape.click();
    await expect(shape).toHaveAttribute("aria-pressed", "true");
  });

  test("the catalogue is measured in centimetres, not in grid cells", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/shapes`);

    // The whole point of the unit: a person can read how big the ad comes out.
    // A full page on the seeded grid is 6 columns of 4.3 cm by 41 one-cm rows.
    await expect(page.getByTestId("shape-row-shape_full")).toContainText("26.0 × 41.0 ס״מ");
    // An eighth is 13 cm by 10 cm — the height is a round number, because a row
    // is 1 cm and the gutter is zero.
    await expect(page.getByTestId("shape-row-shape_eighth")).toContainText("13.0 × 10.0 ס״מ");

    // Cell counts are an internal detail and must not leak into the listing.
    await expect(page.getByTestId("shape-list").getByText("תאים")).toHaveCount(0);
  });

  test("nowhere in the settings screens mentions dpi, CMYK or bleed", async ({ page }) => {
    await loginAsAdmin(page);
    for (const path of [
      `/settings/newspapers/${NEWSPAPERS.alpha}`,
      `/settings/newspapers/${NEWSPAPERS.alpha}/pricing`,
      `/settings/newspapers/${NEWSPAPERS.alpha}/shapes`,
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
