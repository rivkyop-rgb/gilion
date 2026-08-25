import { expect, test } from "@playwright/test";
import { GRID, NEWSPAPERS, loginAsAdmin } from "./helpers";

/**
 * The RTL regression lock.
 *
 * The template canvas this replaced measured the pointer from the box's LEFT
 * edge but painted with `insetInlineStart`, which `dir="rtl"` resolves to
 * `right` — so every rectangle rendered mirrored. It shipped because the only
 * e2e spec covering that screen asserted slot COUNTS and error text, never a
 * rendered position.
 *
 * So these assertions are deliberately about pixels and about the pixel-to-model
 * direction, not about counts. Three independent locks, so no single refactor
 * can quietly restore the mirror:
 *   1. column 0 renders on the right;
 *   2. clicking the right-most pixel selects column 0;
 *   3. a saved region comes back as the same cells.
 *
 * Stage 06's placement canvas must extend this file with the same three
 * assertions against its own grid.
 */
test.describe("RTL: column 0 is the right edge of the page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}/shapes`);
    await page.getByTestId(`edit-shape-shape_strip`).click();
    await expect(page.getByTestId("region-grid")).toBeVisible();
  });

  test("renders column 0 on the right and the last column on the left", async ({ page }) => {
    const grid = (await page.getByTestId("region-grid").boundingBox())!;
    const first = (await page.getByTestId("cell-0-0").boundingBox())!;
    const last = (await page.getByTestId(`cell-${GRID.columns - 1}-0`).boundingBox())!;

    expect(first.x + first.width).toBeGreaterThan(grid.x + grid.width * 0.8);
    expect(last.x).toBeLessThan(grid.x + grid.width * 0.2);
    // The assertion that actually catches a mirror.
    expect(first.x).toBeGreaterThan(last.x);
  });

  test("reads a click on the right-most pixel as column 0, not the last column", async ({
    page,
  }) => {
    await page.getByTestId("region-clear").click();

    const grid = (await page.getByTestId("region-grid").boundingBox())!;
    // Click by PIXEL, assert by MODEL — the exact inversion the old canvas got
    // wrong.
    await page.mouse.click(grid.x + grid.width - 4, grid.y + 4);

    await expect(page.getByTestId("cell-0-0")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`cell-${GRID.columns - 1}-0`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("reads a click on the left-most pixel as the last column", async ({ page }) => {
    await page.getByTestId("region-clear").click();

    const grid = (await page.getByTestId("region-grid").boundingBox())!;
    await page.mouse.click(grid.x + 4, grid.y + 4);

    await expect(page.getByTestId(`cell-${GRID.columns - 1}-0`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("cell-0-0")).toHaveAttribute("aria-pressed", "false");
  });

  test("a saved region comes back as the same cells, not their mirror", async ({ page }) => {
    // A symmetric mirror — wrong on write and wrong again on read — would be
    // invisible to any single-direction test, so this asserts the round trip on
    // a deliberately asymmetric selection.
    await page.fill("#shape-width-cm", "8");
    await page.fill("#shape-height-cm", "2");
    await page.getByTestId("region-clear").click();

    // Two positions on the start side of the page — deliberately asymmetric.
    const row = GRID.rows - 2;
    await page.getByTestId(`cell-0-${row}`).click();
    await page.getByTestId(`cell-1-${row}`).click();
    await page.getByTestId("save-shape").click();

    await page.reload();
    await page.getByTestId("edit-shape-shape_strip").click();

    await expect(page.getByTestId(`cell-0-${row}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(`cell-1-${row}`)).toHaveAttribute("aria-pressed", "true");
    // The mirrored columns must NOT have come back chosen.
    await expect(page.getByTestId(`cell-${GRID.columns - 2}-${row}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByTestId(`cell-${GRID.columns - 3}-${row}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
