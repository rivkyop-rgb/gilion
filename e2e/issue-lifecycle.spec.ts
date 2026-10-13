import { expect, test } from "@playwright/test";

import { NEWSPAPERS, loginAsAdmin } from "./helpers";
import {
  BOARD_DATE,
  boardUrl,
  clearIssuesOn,
  closeIssueUrl,
  issuesOn,
  resetCloseIssue,
  resetFixtureIssue,
  setFixtureIssueStatus,
} from "./issue-helpers";

/** The Tuesday after CLOSE_DATE — what closing opens by itself, and must be free. */
const NEXT_AFTER_CLOSE = "2027-07-13";

/**
 * The issue's own calendar (backlog items 6, 7, 8, 15).
 *
 * Three things a publisher does around a printing date, and one thing the
 * screen has to say out loud.
 */
test.describe("when placing is allowed", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("says so outright, instead of leaving the status to be interpreted", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);

    // "טיוטה" and "בעבודה" both mean yes, and somebody who has to learn that
    // is somebody who will ask instead of placing.
    await expect(page.getByTestId("can-place")).toHaveText("אפשר לשבץ עכשיו");
  });

  test("says why not, when it is closed", async ({ page }) => {
    await setFixtureIssueStatus("closed");
    await loginAsAdmin(page);
    await page.goto(boardUrl);

    await expect(page.getByTestId("can-place")).toContainText("גיליון סגור");
  });
});

test.describe("moving an issue to another date", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
    await clearIssuesOn("2027-06-16");
  });

  test("takes its publications with it, and says how many", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await expect(page.getByTestId("unplaced-count")).toHaveText("(6)");

    await page.getByTestId("change-issue-date").click();
    await page.getByTestId("new-issue-date").fill("2027-06-16");
    await page.getByTestId("confirm-change-date").click();

    // The number is the point: this moved the date a customer bought on
    // approved orders, and that is not a thing to discover afterwards.
    await expect(page.getByTestId("board-message")).toContainText("6 פרסומים");

    // And the board still has them — they moved together, they did not swap.
    await expect(page.getByTestId("unplaced-count")).toHaveText("(6)");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("16.06.2027");
  });

  test("refuses a date that already has an issue for this newspaper", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/issues/new");
    await page.getByTestId("issue-date").fill("2027-06-16");
    await expect(page.getByTestId("issue-preview")).not.toContainText("בחרי תאריך");
    await page.getByTestId("create-issue").click();
    await expect(page).toHaveURL(/\/issues\/.+\/board/);

    await page.goto(boardUrl);
    await page.getByTestId("change-issue-date").click();
    await page.getByTestId("new-issue-date").fill("2027-06-16");

    await expect(page.getByTestId("change-date-dialog")).toContainText("כבר קיים גיליון");
    await expect(page.getByTestId("confirm-change-date")).toBeDisabled();
  });
});

/** The close in this block renders a real PDF — see e2e/issue-draft-pdf.spec.ts. */
test.describe.configure({ timeout: 240_000 });

test.describe("closing an issue opens the next one by itself", () => {
  test.beforeEach(async () => {
    // The CLOSE fixture, not the board one: the board fixture has publications
    // on its date that can never be placed, and an unplaced publication is a
    // blocking finding — so it can never be closed (see CLOSE_DATE).
    await resetCloseIssue();
    await clearIssuesOn(NEXT_AFTER_CLOSE);
  });

  const closeIt = async (page: import("@playwright/test").Page) => {
    await loginAsAdmin(page);
    await page.goto(closeIssueUrl);
    await page.getByTestId("close-issue").click();
    await page.getByTestId("confirm-close-issue").click();
    // Wait for something that can only be true once the SERVER answered — the
    // dialog stays open for the whole transition exactly so this is available
    // (CLAUDE.md). Reading a count that was already right proves nothing.
    await expect(page.getByTestId("close-issue-dialog")).toBeHidden({ timeout: 60_000 });
  };

  test("opens the newspaper's own next printing day, composed the same", async ({ page }) => {
    await closeIt(page);

    // The seeded newspaper prints on Tuesdays; CLOSE_DATE is a Tuesday. No
    // question asked (12/10/2026) — the issue is there, and the notice says so.
    const link = page.getByTestId("next-issue-link");
    await expect(link).toContainText("13.07.2027");
    await link.click();
    await expect(page).toHaveURL(/\/issues\/.+\/board/);

    // Composed like the one just closed: a cover and an inner page.
    await expect(page.getByTestId("view-tab-0")).toContainText("שער");
  });

  test("never opens a second issue on a date that already has one", async ({ page }) => {
    await closeIt(page);
    await expect(page.getByTestId("next-issue-link")).toBeVisible();
    expect(await issuesOn(NEXT_AFTER_CLOSE)).toBe(1);

    // Opening the issues list runs the same check again — and must find it done.
    await page.goto("/issues");
    expect(await issuesOn(NEXT_AFTER_CLOSE)).toBe(1);
  });
});

test.describe("the fixture date itself", () => {
  test("is a printing day for the seeded newspaper", async () => {
    // Guards the specs above: if BOARD_DATE stopped being a Tuesday the "next
    // issue" suggestions would move and the assertions would drift with them.
    expect(new Date(`${BOARD_DATE}T00:00:00.000Z`).getUTCDay()).toBe(2);
    expect(NEWSPAPERS.alpha).toBe("paper_alpha");
  });
});
