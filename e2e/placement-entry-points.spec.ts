import { expect, test } from "@playwright/test";

import { USERS, login, loginAsAdmin } from "./helpers";
import { ISSUE_FIXTURES, resetFixtureIssue } from "./issue-helpers";

/**
 * How somebody GETS to a placement board (backlog item 16).
 *
 * The question that produced this spec was "I don't see where I open an issue
 * for placement" — asked by somebody who had already used the board. The
 * screens were all there; what was missing was any route to them. The first
 * screen after signing in said "nothing here yet, built in stage 10" and
 * stopped, so the only way in was noticing one item in the menu and already
 * knowing that an issue is a thing you open before you can place anything.
 */
test.describe("getting to a board", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("the first screen after signing in leads straight to an open issue", async ({ page }) => {
    await loginAsAdmin(page);

    // Not a dead end: the issues that can be placed into, right there.
    const open = page.getByTestId("open-issues");
    await expect(open).toBeVisible();
    await expect(page.getByTestId(`open-issue-${ISSUE_FIXTURES.issue}`)).toBeVisible();

    await page.getByTestId(`open-issue-${ISSUE_FIXTURES.issue}`).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${ISSUE_FIXTURES.issue}/board`));
    await expect(page.getByTestId("can-place")).toHaveText("אפשר לשבץ עכשיו");
  });

  test("and offers opening one, for whoever may", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByTestId("dashboard-new-issue").click();
    await expect(page).toHaveURL(/\/issues\/new$/);
  });

  test("a publication that is not placed links to the board it belongs on", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/publications");

    // "לא שובץ" was a statement. Somebody reading it wants to go and place it.
    const link = page.getByTestId(`go-to-board-${ISSUE_FIXTURES.quarterA}`);
    await expect(link).toBeVisible();
    await link.click();

    await expect(page).toHaveURL(new RegExp(`/issues/${ISSUE_FIXTURES.issue}/board`));
  });

  test("sales reads the boards but is not offered to open one", async ({ page }) => {
    // The matrix gives sales read access to issues and no write — so the way
    // in is there, and the way to create is not.
    await login(page, USERS.sales);

    await expect(page.getByTestId("open-issues")).toBeVisible();
    await expect(page.getByTestId("dashboard-new-issue")).toHaveCount(0);
  });

  test("accounting sees no placement entry point at all", async ({ page }) => {
    // FR-8: issues are none of accounting's business, in the menu and here.
    await login(page, USERS.accounting);
    await expect(page.getByTestId("open-issues")).toHaveCount(0);
  });
});
