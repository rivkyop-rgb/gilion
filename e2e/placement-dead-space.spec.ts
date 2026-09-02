import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * Rule 7א, the decision of 25/08/2026: a placement may not strand space that
 * nothing in the catalogue can be sold into.
 *
 * The inner page is 26 columns wide and its narrowest shape is 13 columns, so a
 * quarter dropped one column in from the right edge leaves a single unsellable
 * column behind it. Moved flush to the edge, the very same ad is fine — which
 * is the pair that makes the rule legible rather than arbitrary.
 */
test("a placement that strands unsellable space is refused, and points at it", async ({ page }) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);
  await openView(page, FIXTURE.spreadView);

  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-1-0`).click();

  const message = page.getByTestId("board-message");
  await expect(message).toContainText("שטח פנוי");
  // The remainder is MEASURED, in centimetres — never counted in cells.
  await expect(message).toContainText("ס״מ");
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);

  // One column over, flush with the right edge, and it is accepted. The ad is
  // still in hand after the refusal, so this is one click and not two.
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();

  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
});
