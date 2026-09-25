import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { OPEN_DATE, clearIssuesOn, setIssueDate } from "./issue-helpers";

/**
 * SUCCESS CRITERION, prd.md §7:
 * "a designer opens an issue and immediately sees every publication that is
 * not yet placed" (US-007 AC-1, AC-2).
 *
 * The assertion is deliberately about the FIRST render of the board and not
 * about a list that fills in after a click: the whole value of the screen is
 * that the day's work is visible without asking for it.
 */
test.describe("opening an issue", () => {
  test.beforeEach(async () => {
    await clearIssuesOn(OPEN_DATE);
  });

  test("snapshots the grid, builds cover-spread-back, and shows the unplaced list at once", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/issues/new");

    await setIssueDate(page, OPEN_DATE);

    // The form opens on cover, six inner, back — two folded sheets (25/09/2026).
    await expect(page.getByTestId("page-list").getByRole("listitem")).toHaveCount(8);
    await expect(page.getByTestId("issue-preview")).toContainText("8");

    // And it knows what is waiting for that date before anything exists.
    await expect(page.getByTestId("issue-preview")).toContainText("2 פרסומים כבר מתוכננים");

    await page.getByTestId("create-issue").click();

    // Straight onto the board — and the panel is already full.
    await expect(page).toHaveURL(/\/issues\/.+\/board/);
    await expect(page.getByTestId("unplaced-count")).toHaveText("(2)");
    await expect(page.getByTestId("unplaced-list").getByRole("listitem")).toHaveCount(2);

    // Five views: the cover alone, three inner spreads, the back alone.
    await expect(page.getByTestId("pager-label")).toContainText("שער");
    await expect(page.getByTestId("view-tab-0")).toBeVisible();
    await expect(page.getByTestId("view-tab-1")).toContainText("עמודים 2-3");
    await expect(page.getByTestId("view-tab-3")).toContainText("עמודים 6-7");
    await expect(page.getByTestId("view-tab-4")).toContainText("גב");

    // The snapshot: the newspaper's 26 x 41 grid, on the cover.
    await expect(page.getByTestId("page-canvas-1")).toBeVisible();
    await expect(page.getByTestId("board-cell-1-25-40")).toBeAttached();
  });

  test("refuses a second issue for the same newspaper and date", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/issues/new");
    await setIssueDate(page, OPEN_DATE);
    await page.getByTestId("create-issue").click();
    await expect(page).toHaveURL(/\/issues\/.+\/board/);

    await page.goto("/issues/new");
    await setIssueDate(page, OPEN_DATE);
    await expect(page.getByTestId("issue-preview")).toContainText("כבר קיים גיליון");
    await expect(page.getByTestId("create-issue")).toBeDisabled();
  });
});
