import { expect, test } from "@playwright/test";
import { GRID, NEWSPAPERS, SHAPES, USERS, login, loginAsAdmin } from "./helpers";

const shapesUrl = (paper: string) => `/settings/newspapers/${paper}/shapes`;

/** US-006 AC-4: the newspaper owns the set of shapes it divides a page into. */
test.describe("the shape catalogue (US-006 AC-4)", () => {
  test("adds a shape sized in centimetres and it survives a reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    const name = `צורה ${Date.now()}`;
    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", name);
    // Whole centimetres on a 1 cm module: saved exactly as typed.
    await page.fill("#shape-width-cm", "10");
    await page.fill("#shape-height-cm", "13");

    // The size the ad actually prints at is on screen before saving — that is
    // the whole reason the form is in centimetres.
    await expect(page.getByTestId("shape-actual-size")).toContainText("10.0 × 13.0 ס״מ");

    await page.getByTestId("save-shape").click();

    await expect(page.getByText(name)).toBeVisible();
    await page.reload();
    const row = page.locator("li", { hasText: name });
    await expect(row).toContainText("10.0 × 13.0 ס״מ");
    await expect(row).toContainText("מותרת בכל מקום בעמוד");
  });

  test("both dimensions are in the same unit — no column count is asked for", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));
    await page.getByTestId("new-shape").click();

    // Two units side by side read as confusing rather than as precise, so the
    // form asks for centimetres both ways and does the snapping itself.
    await expect(page.getByTestId("shape-form")).toContainText("רוחב בס״מ");
    await expect(page.getByTestId("shape-form")).toContainText("גובה בס״מ");
    await expect(page.locator("#shape-cols")).toHaveCount(0);
  });

  test("snaps a size that falls between cells and says why before saving", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", `הצמדה ${Date.now()}`);
    // Neither number lands on a cell boundary: the module is 1 cm, so 12.4 and
    // 7.4 both round to the nearest whole centimetre.
    await page.fill("#shape-width-cm", "12.4");
    await page.fill("#shape-height-cm", "7.4");

    const actual = page.getByTestId("shape-actual-size");
    await expect(actual).toContainText("12.0 × 7.0 ס״מ");
    // And it must say WHY, or the changed number looks like a bug.
    await expect(actual).toContainText("הגודל הותאם לחלוקת העמוד");
  });

  test("refuses a duplicate name inside the newspaper", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", "עמוד מלא"); // already seeded here
    await page.getByTestId("save-shape").click();

    await expect(page.getByTestId("form-error").first()).toContainText("כבר קיימת צורה בשם הזה");
  });

  test("refuses a shape wider than the grid", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", `רחבה ${Date.now()}`);
    // The server is the only boundary that knows the page width.
    await page.fill("#shape-width-cm", "80");
    await page.getByTestId("save-shape").click();

    await expect(page.getByTestId("form-error").first()).toContainText("גדולה מהעמוד");
  });

  test("constrains a shape to a region and the cells survive a reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    const name = `מוגבלת ${Date.now()}`;
    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", name);
    await page.fill("#shape-width-cm", "8");
    await page.fill("#shape-height-cm", "2");
    await page.getByTestId("mode-region").check();
    // Place the shape rather than shade an area — one click, whole footprint.
    await page.getByTestId("region-bottom").click();
    // Assert that a positive count is reported, not the exact sentence — the
    // wording of this line has already changed once.
    await expect(page.getByTestId("region-positions")).toHaveText(/[1-9]\d* מיקומים/);
    await page.getByTestId("save-shape").click();

    await expect(page.getByText(name)).toBeVisible();
    await page.reload();

    const row = page.locator("li", { hasText: name });
    await expect(row).toContainText("מותרת ב־");
    await row.getByRole("button", { name: "עריכה" }).click();

    // The bottom position came back chosen; the top of the page did not. The
    // position is the shape's top-start cell, so a 2-row shape sitting on the
    // page foot starts two rows up.
    await expect(page.getByTestId(`cell-0-${GRID.rows - 2}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("cell-0-0")).toHaveAttribute("aria-pressed", "false");
  });

  test("refuses a region too small for the shape it constrains", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", `צרה ${Date.now()}`);
    await page.fill("#shape-width-cm", "13");
    await page.fill("#shape-height-cm", "3");
    await page.getByTestId("mode-region").check();

    // A click where the shape would hang off the page is pulled back to where
    // it fits (03/11/2026), so the whole page is clickable.
    await expect(page.getByTestId(`cell-${GRID.columns - 1}-0`)).toHaveAttribute(
      "data-fits",
      "true",
    );

    // Saving with nothing placed is still refused by the server.
    await page.getByTestId("save-shape").click();
    await expect(page.getByTestId("form-error").first()).toContainText("אף מיקום חוקי");
  });

  test("deleting a shape removes it from the page types too", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(shapesUrl(NEWSPAPERS.alpha));

    const name = `זמנית ${Date.now()}`;
    await page.getByTestId("new-shape").click();
    await page.fill("#shape-name", name);
    await page.getByTestId("save-shape").click();
    await expect(page.getByText(name)).toBeVisible();

    // Allow it on the cover, then delete the shape itself.
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);
    const toggle = page.locator(`[data-testid^="shape-pt_cover-"]`, { hasText: name });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page.goto(shapesUrl(NEWSPAPERS.alpha));
    await page.locator("li", { hasText: name }).getByRole("button", { name: "מחיקה" }).click();
    await expect(page.getByText(name)).toHaveCount(0);

    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("each newspaper sees only its own catalogue", async ({ page }) => {
    await login(page, USERS.betaAdmin);
    await page.goto(shapesUrl(NEWSPAPERS.beta));

    await expect(page.getByTestId("shape-row-shape_beta_full")).toBeVisible();
    await expect(page.getByTestId(`shape-row-${SHAPES.full}`)).toHaveCount(0);
  });
});
