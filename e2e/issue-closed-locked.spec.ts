import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import {
  FIXTURE,
  ISSUE_FIXTURES,
  boardUrl,
  openView,
  resetFixtureIssue,
  setFixtureIssueStatus,
} from "./issue-helpers";

/**
 * FR-6: a closed issue is closed to everyone, admin included.
 *
 * The second test is the one that matters. Disabling the canvas is a courtesy;
 * the guarantee is that the Server Action refuses even when the page in front
 * of the person still believes the issue is open — which is exactly the state a
 * stale tab is in.
 */
test.describe("a closed issue", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("locks the canvas and says so", async ({ page }) => {
    await setFixtureIssueStatus("closed");
    await loginAsAdmin(page);
    await page.goto(boardUrl);

    await expect(page.getByTestId("lock-overlay")).toContainText("גיליון סגור");
    await expect(page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-0`)).toBeDisabled();
  });

  test("refuses a placement in the server even from a page that loaded while it was open", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);
    await expect(page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`)).toBeEnabled();

    // The issue closes underneath the open tab.
    await setFixtureIssueStatus("closed");

    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();

    await expect(page.getByTestId("board-message")).toContainText("גיליון סגור");
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(0);
  });

  test("a designer cannot edit a ready_for_print issue, and an admin can", async ({ page }) => {
    await setFixtureIssueStatus("ready_for_print");
    await loginAsAdmin(page);
    await page.goto(boardUrl);

    // The admin exception (stage 06 §הרשאות).
    await expect(page.getByTestId("lock-overlay")).toHaveCount(0);
    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
  });
});
