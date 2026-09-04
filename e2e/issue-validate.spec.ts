import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { checkUrl, resetFixtureIssue, seedFindingPlacements } from "./issue-helpers";

/**
 * The check screen (US-008 AC-1, AC-2).
 *
 * ── Six findings, not seven ──────────────────────────────────────────────────
 * The one missing is the geometric overlap. `placement_no_overlap` is an
 * EXCLUDE constraint (conventions.md §4), so Postgres refuses the second
 * rectangle whichever way it is written — from the board, from a Server Action,
 * or from the fixture helper. It is not reachable through a browser because it
 * is not reachable at all, which is the point of having it in the database.
 * The rule itself is asserted directly in lib/domain/issue-validation.test.ts.
 *
 * Everything else here is seeded through Prisma rather than clicked, because
 * five of the six are states stage 06 refuses to CREATE and only time can
 * produce: an ad archived after it was placed, a shape dropped from a page
 * type's allowed list last week.
 */
test.describe("an issue with something wrong on every page", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
    await seedFindingPlacements();
  });

  test("shows every finding it can, and refuses to close", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(checkUrl);

    // 1 — sold for the date, nowhere on the paper.
    await expect(page.getByTestId("finding-unplaced_publication")).toHaveAttribute(
      "data-severity",
      "blocking",
    );
    // 2 — the ad on the page belongs to nobody.
    await expect(page.getByTestId("finding-ad_without_customer")).toContainText("ללא לקוח");
    // 3 — the file never passed validation.
    await expect(page.getByTestId("finding-ad_unusable")).toContainText("ולידציה");
    // 4 — the same publication twice, and only one copy approved.
    await expect(
      page
        .getByTestId("finding-duplicate_placement")
        .getByTestId("finding-item-duplicate_placement"),
    ).toHaveCount(2);
    // 6 — a full page on a cover that accepts two shapes.
    await expect(page.getByTestId("finding-shape_not_allowed")).toContainText("עמוד מלא");
    // 7 — the warning, which does NOT block.
    await expect(page.getByTestId("finding-empty_page")).toHaveAttribute(
      "data-severity",
      "warning",
    );

    // The button is disabled, and it says how much work is left rather than
    // merely being grey.
    await expect(page.getByTestId("close-issue")).toBeDisabled();
    await expect(page.getByTestId("blocking-summary")).toContainText("פרסומים שמתוכננים");
  });

  test("counts what is due against what got placed", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(checkUrl);

    // Six publications on the fixture date. The five seeded placements cover
    // four DISTINCT ones — the duplicate pair is one publication placed twice,
    // and it counts once here. That is the number a person is asking for when
    // they read "placed": how many of the things I sold are on the paper.
    await expect(page.getByTestId("kpi-planned")).toHaveText("6");
    await expect(page.getByTestId("kpi-placed")).toHaveText("4");
    await expect(page.getByTestId("kpi-unplaced")).toHaveText("2");
  });

  test("links each finding to the page it is on", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(checkUrl);

    // The full-page-on-a-cover finding is on page 1 — and the link opens the
    // board already looking at it, rather than at whatever came first.
    await page
      .getByTestId("finding-shape_not_allowed")
      .getByTestId("finding-item-shape_not_allowed")
      .first()
      .click();

    await expect(page).toHaveURL(/\/board\?page=1$/);
    await expect(page.getByTestId("pager-label")).toContainText("שער");
  });
});

test.describe("a clean issue", () => {
  test.beforeEach(async () => {
    await resetFixtureIssue();
  });

  test("says what passed, not only what failed", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(checkUrl);

    // Nothing is placed at all, so the overlap and shape checks have nothing to
    // complain about — and a screen that simply omitted them would leave a
    // person wondering whether they ran.
    await expect(page.getByTestId("finding-overlap")).toHaveAttribute("data-severity", "clear");
    await expect(page.getByTestId("finding-overlap")).toContainText("אין חפיפות");
  });
});
