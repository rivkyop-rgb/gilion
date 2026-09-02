import { expect, test } from "@playwright/test";
import { GRID, NEWSPAPERS, loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

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

  /**
   * PENDING A PRODUCT DECISION — see docs/plan/03-newspaper-config.md §פתוח.
   *
   * `shape_strip` is 8 columns wide on a 26-column grid, so the last column
   * that can host it is 18, not 25. Clicking the far-left pixel targets column
   * 25, the app correctly refuses ("הצורה לא נכנסת בעמודה 26"), and this
   * expectation cannot be met as written.
   *
   * Either the test is wrong and should expect column 18, or the app should
   * CLAMP a near-edge click to the last column that fits. The second is a
   * change in behaviour and is the user's call, so the test is marked rather
   * than quietly rewritten to match whatever the code happens to do — which
   * would destroy the only record that the question was ever asked.
   */
  test.fixme("reads a click on the left-most pixel as the last column", async ({ page }) => {
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

/**
 * The same three locks, against stage 06's PLACEMENT canvas.
 *
 * This is the canvas the original bug actually lived in: a page being laid out,
 * where an ad rendered on the wrong side of the paper is a mis-print rather
 * than a cosmetic slip. The shape picker above and this board share
 * `cellAtPointer` and `toCanvasPercent`, and the point of testing both is that
 * neither may drift: one of them getting its own copy of the arithmetic is
 * exactly how the mirror came back last time.
 */
test.describe("RTL: the placement canvas counts from the right too", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    // The inner spread, whose right-hand page accepts the quarter used below.
    await openView(page, FIXTURE.spreadView);
    await expect(page.getByTestId(`page-canvas-${FIXTURE.innerRightPage}`)).toBeVisible();
  });

  test("renders column 0 on the right and the last column on the left", async ({ page }) => {
    const canvas = (await page.getByTestId(`page-canvas-${FIXTURE.innerRightPage}`).boundingBox())!;
    const first = (await page
      .getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`)
      .boundingBox())!;
    const last = (await page
      .getByTestId(`board-cell-${FIXTURE.innerRightPage}-${GRID.columns - 1}-0`)
      .boundingBox())!;

    expect(first.x + first.width).toBeGreaterThan(canvas.x + canvas.width * 0.8);
    expect(last.x).toBeLessThan(canvas.x + canvas.width * 0.2);
    expect(first.x).toBeGreaterThan(last.x);
  });

  /**
   * Drag by PIXEL, assert by MODEL — and deliberately by dragging rather than
   * by clicking a cell, because a click lands on the cell's own element and
   * would never call `cellAtPointer` at all. The drop path is the only one
   * that turns a pointer into a column, which is the conversion that broke.
   */
  test("reads a drop on the right-most pixel as column 0", async ({ page }) => {
    const item = page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`);
    const itemBox = (await item.boundingBox())!;
    const canvas = (await page.getByTestId(`page-canvas-${FIXTURE.innerRightPage}`).boundingBox())!;

    await page.mouse.move(itemBox.x + itemBox.width / 2, itemBox.y + itemBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width - 4, canvas.y + 4, { steps: 8 });
    await page.mouse.up();

    const placement = page.locator('[data-testid^="placement-"]');
    await expect(placement).toHaveCount(1);

    // The stored column is 0, which on screen is the RIGHT edge — read back
    // from the rendered box rather than from the click that produced it.
    const placed = (await placement.boundingBox())!;
    expect(placed.x + placed.width).toBeGreaterThan(canvas.x + canvas.width * 0.9);
    expect(placed.x).toBeGreaterThan(canvas.x + canvas.width * 0.2);
  });

  test("a saved placement in the right corner comes back in the right corner", async ({ page }) => {
    // Asymmetric on purpose: a mirror that is wrong on write AND wrong on read
    // is invisible to any test that only looks in one direction.
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await page.reload();
    await openView(page, FIXTURE.spreadView);
    // Both elements have to be laid out before either box is read: a reload can
    // resolve the locator against a document that has not painted yet, and
    // boundingBox() then answers null rather than waiting.
    const canvasBox = page.getByTestId(`page-canvas-${FIXTURE.innerRightPage}`);
    const placedBox = page.locator('[data-testid^="placement-"]');
    await expect(canvasBox).toBeVisible();
    await expect(placedBox).toHaveCount(1);
    await expect(placedBox).toBeVisible();

    const canvas = (await canvasBox.boundingBox())!;
    const placed = (await placedBox.boundingBox())!;

    expect(placed.x + placed.width).toBeGreaterThan(canvas.x + canvas.width * 0.9);
    // The mirrored position — flush LEFT — is the failure this locks out.
    expect(placed.x).toBeGreaterThan(canvas.x + canvas.width * 0.4);
  });
});
