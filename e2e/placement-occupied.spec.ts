import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * FR-16, the UI half.
 *
 * The DATABASE half — two transactions racing for the same cells and one of
 * them coming back as Postgres' 23P01 — is asserted in
 * lib/data/placement-overlap.test.ts, where a real race can be provoked
 * deterministically. A browser cannot; two clicks in two tabs are only ever
 * probably simultaneous, and a test that is probably a race is a flake.
 */
test("occupied space is refused, and the message names the size in the way", async ({ page }) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);
  await openView(page, FIXTURE.spreadView);

  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

  await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterB}`).click();
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();

  await expect(page.getByTestId("board-message")).toContainText("השטח תפוס");
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

  // Beside it, touching at the edge, is a normal layout and not a conflict.
  await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-13-0`).click();
  await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(2);
});
