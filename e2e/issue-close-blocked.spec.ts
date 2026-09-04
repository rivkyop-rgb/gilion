import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import {
  CLOSE_DATE,
  ISSUE_FIXTURES,
  addStrayPublication,
  checkUrl,
  closeIssueUrl,
  issueState,
  resetCloseIssue,
  resetFixtureIssue,
} from "./issue-helpers";

/**
 * A blocking finding stops the close — on the SERVER, not only on the button
 * (validation rule 2).
 *
 * The distinction is the whole test. A disabled button is a courtesy; the
 * guarantee is that an issue with an unplaced publication cannot be closed by
 * anything, including a screen that has gone stale. So the second test creates
 * exactly that: it opens the confirmation while the issue is closeable, breaks
 * the issue underneath it, and then presses the button. The client believes it
 * may close. The server decides otherwise, and says so in Hebrew.
 */
/**
 * One of these closes for real. See issue-draft-pdf.
 */
test.describe.configure({ timeout: 240_000 });

test.describe("with a blocking finding on screen", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("the close button is disabled and explains itself", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(checkUrl);

    await expect(page.getByTestId("kpi-blocking")).not.toHaveText("0");
    await expect(page.getByTestId("close-issue")).toBeDisabled();
    await expect(page.getByTestId("blocking-summary")).toBeVisible();
  });
});

test.describe("when the screen is out of date", () => {
  test.beforeEach(async () => {
    await resetCloseIssue();
  });

  test("the server refuses anyway, and nothing moves", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);

    // The page was rendered against a closeable issue.
    await expect(page.getByTestId("close-issue")).toBeEnabled();
    await page.getByTestId("close-issue").click();

    // Now somebody approves an order for this date in another room.
    await addStrayPublication();

    await page.getByTestId("confirm-close-issue").click();

    // The refusal lands in the dialog, where the decision was made.
    await expect(page.getByTestId("form-error")).toContainText("ממצאים חוסמים", {
      timeout: 120_000,
    });

    const { issue, publications } = await issueState(ISSUE_FIXTURES.closeIssue);
    expect(issue.status).toBe("in_layout");
    expect(issue.final_pdf_url).toBeNull();
    expect(issue.placements.map((p) => p.status)).toEqual(["placed"]);
    expect(publications.map((p) => p.status)).toEqual(["placed"]);
    // A refusal is not a failed render, so it leaves no `failed` log row either.
    expect(issue.pdf_logs).toHaveLength(0);
  });

  test("a closed issue cannot be closed twice", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);
    await page.getByTestId("close-issue").click();
    await page.getByTestId("confirm-close-issue").click();
    await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 120_000 });

    // The button is gone from a closed issue, and the reopen one is in its
    // place — so the second close is not merely refused, it is unreachable.
    await expect(page.getByTestId("close-issue")).toHaveCount(0);
    await expect(page.getByTestId("reopen-issue")).toBeVisible();
    await expect(page.getByTestId("final-pdf-card")).toBeVisible();
  });
});

test.describe("the fixture dates", () => {
  test("do not collide", async () => {
    // Guards every close spec: a publication lands on a board by (newspaper,
    // date) alone, so the day the close fixture lives on has to be its own.
    expect(CLOSE_DATE).not.toBe("2027-06-15");
    expect(CLOSE_DATE).not.toBe("2027-06-22");
  });
});
