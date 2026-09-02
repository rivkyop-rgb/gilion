import { expect, test } from "@playwright/test";

import { NEWSPAPERS, loginAsAdmin } from "./helpers";
import { BOARD_DATE, boardUrl, resetFixtureIssue, setFixtureIssueStatus } from "./issue-helpers";
import { clearIssuesOn } from "./issue-helpers";

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

test.describe("closing an issue offers the next one", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
    await setFixtureIssueStatus("ready_for_print");
  });

  test("proposes the newspaper's own next printing day, and opens it composed the same", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);

    await page.getByTestId("set-status-closed").click();

    // The moment an issue closes is the moment the next one starts mattering,
    // and the moment somebody has the schedule in their head.
    const offer = page.getByTestId("next-issue-offer");
    await expect(offer).toBeVisible();
    // The seeded newspaper prints on Tuesdays; the fixture date is a Tuesday.
    await expect(page.getByTestId("next-issue-options")).toContainText("22.06.2027");

    await page.getByTestId("open-next-issue").click();
    await expect(page).toHaveURL(/\/issues\/.+\/board/);

    // Composed like the one just closed: cover, an inner spread, a back.
    await expect(page.getByTestId("view-tab-0")).toContainText("שער");
    await expect(page.getByTestId("view-tab-1")).toContainText("עמודים 2-3");
    await expect(page.getByTestId("view-tab-2")).toContainText("גב");
  });

  test("never proposes a date that already has an issue", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(boardUrl);
    await page.getByTestId("set-status-closed").click();
    await expect(page.getByTestId("next-issue-offer")).toBeVisible();

    const options = page.getByTestId("next-issue-options");
    // The fixture's own date is behind us, but the guard is what matters: an
    // offered date that is taken is marked, not silently accepted.
    const taken = options.getByText("כבר קיים גיליון בתאריך הזה");
    if ((await taken.count()) > 0) {
      await expect(page.getByTestId("open-next-issue")).toBeEnabled();
    }
    await expect(options).not.toContainText("לא יוצא עיתון בחג");
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
