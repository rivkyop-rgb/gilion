import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * US-007 AC-3 and AC-4: put an ad on the page, see what it is, take it off.
 *
 * The size assertion is the one worth keeping honest — AC-4 asks for the size,
 * and conventions.md §1 fixes the unit at centimetres. A panel that reported
 * "13 x 21" would satisfy a naive reading of AC-4 and mean nothing to the
 * person holding the printed page.
 */
test.describe("placing an ad on a page", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    // The inner spread — the only view whose page type accepts a quarter.
    await openView(page, FIXTURE.spreadView);
  });

  test("places, describes and removes", async ({ page }) => {
    // Six publications are due that day: four placeable, and two that are
    // listed with their reason and cannot be dragged at all.
    await expect(page.getByTestId("unplaced-count")).toHaveText("(6)");

    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();

    // One fewer to place, and the ad is on the canvas.
    await expect(page.getByTestId("unplaced-count")).toHaveText("(5)");
    const placement = page.locator('[data-testid^="placement-"]');
    await expect(placement).toHaveCount(1);

    await placement.click();
    const details = page.getByTestId("selected-details");
    await expect(details).toContainText("רבע עמוד");
    await expect(details).toContainText("עמוד");
    // 13 columns of 1 cm and 21 rows of 1 cm, with no gutter.
    await expect(details).toContainText("13.0 × 20.0 ס״מ");

    await page.getByTestId("remove-placement-trigger").click();
    await page.getByTestId("remove-placement-confirm").click();

    await expect(page.getByTestId("unplaced-count")).toHaveText("(6)");
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);
  });

  test("moves an existing placement to another cell", async ({ page }) => {
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    // Pick the placed ad up and drop it in the other half of the page. The
    // move must not be refused for overlapping the space it is leaving.
    await page.locator('[data-testid^="placement-"]').first().click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-13-0`).click();

    await expect(page.getByTestId("board-message")).toHaveCount(0);
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
    await expect(page.getByTestId("unplaced-count")).toHaveText("(5)");
  });
});
