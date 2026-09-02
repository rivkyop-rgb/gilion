import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";
import { validPdf } from "./ad-fixtures";

/**
 * The other half of the panel: what has already been done.
 *
 * Until now the board could only answer "what is left". Checking what was
 * already placed meant walking every spread and clicking every rectangle —
 * which is exactly the review nobody does, and exactly when last month's
 * artwork goes to print.
 */
test.describe("the placed tab", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
  });

  test("starts empty, and lists what was placed with the page it is on", async ({ page }) => {
    await expect(page.getByTestId("placed-count")).toHaveText("(0)");

    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await expect(page.getByTestId("placed-count")).toHaveText("(1)");
    await page.getByTestId("tab-placed").click();

    const row = page.locator('[data-testid^="placed-item-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("רבע עמוד");
    // Which page it is on, named — a seller does not think in page numbers on
    // the outside pages.
    await expect(row).toContainText(`עמוד ${FIXTURE.innerRightPage}`);
  });

  test("jumps to the page an ad is on", async ({ page }) => {
    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    // Walk away, then come back through the list.
    await openView(page, FIXTURE.coverView);
    await expect(page.getByTestId("pager-label")).toContainText("שער");

    await page.getByTestId("tab-placed").click();
    await page.locator('[data-testid^="placed-jump-"]').first().click();
    await expect(page.getByTestId("pager-label")).toContainText("עמודים 2-3");
  });

  test("opens the real file when the name is clicked", async ({ page }) => {
    // The artwork has to be a real one, or there is nothing to open.
    await page.getByTestId(`upload-for-${ISSUE_FIXTURES.noAd}`).click();
    await page.getByTestId("board-upload-file").setInputFiles(await validPdf("לבדיקה.pdf"));
    await page.getByTestId("board-upload-submit").click();
    await expect(page.getByTestId("board-upload-dialog")).toHaveCount(0);

    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.noAd}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await page.getByTestId("tab-placed").click();
    await page.locator('[data-testid^="placed-name-"]').first().click();

    // The same dialog the ad library uses — one preview in the product, not a
    // second one that drifts from it.
    const dialog = page.locator('[data-testid^="placed-preview-name-"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("לבדיקה.pdf");
  });
});
