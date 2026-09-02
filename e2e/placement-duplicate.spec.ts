import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * FR-16, second half: one publication is placed once per issue, and only an
 * admin may forgive that.
 *
 * The override is deliberately reachable — the panel can be told to show what
 * is already placed — because a rule nobody can attempt to break is a rule
 * nobody can be granted an exception to, and FR-16 explicitly grants one.
 */
test.describe("placing the same publication twice", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("is refused, and an admin can approve the exception", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);

    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    // The same publication again, somewhere it would otherwise fit.
    await page.getByTestId("show-placed").check();
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-13-0`).click();

    await expect(page.getByTestId("board-message")).toContainText("כבר משובץ");
    await expect(page.getByTestId("duplicate-dialog")).toBeVisible();

    await page.getByTestId("confirm-duplicate").click();
    await expect(page.getByTestId("duplicate-dialog")).toHaveCount(0);

    // With the exception approved, the second placement goes through. The ad
    // is still in hand — a refusal does not put it down.
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-13-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(2);

    // And it is on the record (FR-10). The audit screen still prints the raw
    // action name — a stage 01 screen, and not this stage's to translate.
    await page.goto("/audit");
    await expect(page.getByRole("main")).toContainText("override_duplicate_placement");
  });

  test("a designer is not offered the exception at all", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await login(page, USERS.designer);
    await page.goto(boardUrl);

    // The toggle that makes a duplicate reachable is admin-only.
    await expect(page.getByTestId("show-placed")).toHaveCount(0);
  });
});
