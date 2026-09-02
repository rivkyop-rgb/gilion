import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * US-005 AC-4: an ad with no customer is not placeable, and neither is a
 * publication with no artwork at all.
 *
 * Both are refused BEFORE the drag rather than after the drop. Offering an
 * item that can never be accepted and explaining afterwards is how a board
 * teaches people to ignore its errors.
 */
test("a publication with no ad, and one whose ad has no customer, cannot be dragged", async ({
  page,
}) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);
  await openView(page, FIXTURE.spreadView);
  await page.getByTestId("show-placed").check();

  const noAd = page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.noAd}`);
  await expect(noAd).toBeDisabled();
  await expect(noAd).toContainText("אין מודעה");

  const orphan = page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.orphanAd}`);
  await expect(orphan).toBeDisabled();
  await expect(orphan).toContainText("המודעה ללא לקוח");

  // Clicking a blocked item selects nothing, so a following cell click cannot
  // place it by accident.
  await orphan.click({ force: true });
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);
});
