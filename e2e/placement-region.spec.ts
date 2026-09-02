import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { GRID } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, resetFixtureIssue } from "./issue-helpers";

/**
 * Rule 11: a shape with an explicit allowed region may only sit inside it.
 *
 * The seeded strip is 7 rows tall on a 41-row page and is allowed only flush
 * with the foot, which is row 34 and no other. Dropping it at the top must be
 * refused in the SERVER, not merely discouraged in the canvas.
 */
test("a bottom-only strip is refused at the top of the page and accepted at the foot", async ({
  page,
}) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);

  // The cover accepts the strip; what it refuses is the strip up here.
  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.strip}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-0`).click();

  await expect(page.getByTestId("board-message")).toContainText("אינה מותרת במיקום הזה");
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);

  // The strip stays selected after a refusal — that is the point: the answer
  // to "not there" is another cell, not picking the ad up again.
  const foot = GRID.rows - 7;
  await page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-${foot}`).click();

  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
});
