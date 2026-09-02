import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * US-007 AC-3 / FR-14: a page type accepts a fixed set of shapes.
 *
 * The seeded cover accepts only the strip and the quarter, so a full-page
 * publication has nowhere to go on it — and the refusal has to say which shape
 * and not merely "not allowed", or the designer has no way to know whether the
 * problem is the ad, the page or the position.
 */
test("a shape the page type does not allow is refused by the server, with the reason", async ({
  page,
}) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);

  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.full}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-0`).click();

  await expect(page.getByTestId("board-message")).toContainText("עמוד מלא");
  await expect(page.getByTestId("board-message")).toContainText("אינה מותרת בסוג העמוד הזה");
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);

  // The same shape is fine on an inner page, which does allow it. Turning the
  // page puts the ad down — holding one while looking at a different spread is
  // an aim at nothing — so it is picked up again first.
  await openView(page, FIXTURE.spreadView);
  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.full}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
});
