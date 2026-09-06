import { expect, test } from "@playwright/test";

import { STRIP_FOOT_ROW, USERS, login, loginAsAdmin } from "./helpers";
import {
  FIXTURE,
  ISSUE_FIXTURES,
  boardUrl,
  openView,
  resetFixtureIssue,
  setFixtureIssueStatus,
} from "./issue-helpers";

/**
 * Every issue and what went into it (backlog item 11).
 *
 * Before this, "which issues are done and what is in them" was answerable only
 * by opening each board in turn and reading its pages — the kind of check
 * people stop doing, right before an issue goes to print with a page nobody
 * looked at.
 */
test.describe("the issue tracking screen", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("lists what was placed, with the page, the shape and the size in centimetres", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await page.goto("/issues/report");

    const table = page.getByTestId(`report-table-${ISSUE_FIXTURES.issue}`);
    await expect(table).toContainText("רבע עמוד");
    await expect(table).toContainText(`עמוד ${FIXTURE.innerRightPage}`);
    // Centimetres, measured against this issue's own snapshot grid.
    await expect(table).toContainText("13.0 × 20.0 ס״מ");
  });

  test("names the outside pages instead of numbering them", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.strip}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.coverPage}-0-${STRIP_FOOT_ROW}`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await page.goto("/issues/report");
    await expect(page.getByTestId(`report-table-${ISSUE_FIXTURES.issue}`)).toContainText("שער");
  });

  test("separates the issues that are done from the ones that are not", async ({ page }) => {
    await setFixtureIssueStatus("closed");
    await loginAsAdmin(page);

    await page.goto("/issues/report?status=closed");
    await expect(page.getByTestId(`report-issue-${ISSUE_FIXTURES.issue}`)).toBeVisible();
    await expect(page.getByTestId(`report-status-${ISSUE_FIXTURES.issue}`)).toHaveText("סגור");

    await page.goto("/issues/report?status=open");
    await expect(page.getByTestId(`report-issue-${ISSUE_FIXTURES.issue}`)).toHaveCount(0);
  });

  /**
   * `Placement` carries no user, so the screen must not print a name under a
   * heading that claims otherwise. Locked here because a tracking screen that
   * invents one fact cannot be used to check any other.
   */
  test("does not claim to know who placed an ad", async ({ page }) => {
    await loginAsAdmin(page);
    // The column only exists once something is in the table.
    await page.goto(boardUrl);
    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await page.goto("/issues/report");

    // The column is named for what it actually holds. "מי שיבץ" would be an
    // invention — Placement carries no user — and a tracking screen that
    // invents one field cannot be trusted for any of the others.
    await expect(page.getByTestId("col-uploaded-by").first()).toHaveText("מי העלה את המודעה");
    await expect(
      page.getByTestId(`report-table-${ISSUE_FIXTURES.issue}`).getByRole("columnheader", {
        name: "מי שיבץ",
      }),
    ).toHaveCount(0);
  });

  test("is reachable from the issues list, and closed to accounting", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/issues");
    await page.getByTestId("issue-report-link").click();
    await expect(page).toHaveURL(/\/issues\/report$/);

    // FR-8: issues are none of accounting's business, here as everywhere.
    await login(page, USERS.accounting);
    await page.goto("/issues/report");
    await expect(page.getByRole("heading", { name: "אין לך הרשאה לעמוד הזה" })).toBeVisible();
  });
});
