import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./helpers";
import { FIXTURE, ISSUE_FIXTURES, boardUrl, openView, resetFixtureIssue } from "./issue-helpers";

/**
 * Composing the issue after it is open.
 *
 * The removal guard is the part worth testing: `IssuePage` cascades to
 * `Placement`, so deleting a page that still carries ads would take live
 * placements — and the publications' statuses with them — out of the database
 * as a side effect of what looks like a layout tweak. The server refuses and
 * says why; nothing about the button hints at how much it could destroy.
 */
test.describe("the pages of an issue", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
  });

  test("opens as a cover, an inner spread and a back", async ({ page }) => {
    await expect(page.getByTestId("pager-label")).toContainText("שער");

    await page.getByTestId("pager-next").click();
    await expect(page.getByTestId("pager-label")).toContainText("עמודים 2-3");
    // Both halves of the spread are on screen at once — that is the whole point.
    await expect(page.getByTestId(`page-canvas-${FIXTURE.innerRightPage}`)).toBeVisible();
    await expect(page.getByTestId(`page-canvas-${FIXTURE.innerLeftPage}`)).toBeVisible();

    await page.getByTestId("pager-next").click();
    await expect(page.getByTestId("pager-label")).toContainText("גב");
    await expect(page.getByTestId("pager-next")).toBeDisabled();
  });

  test("renders the lower page number on the right of the spread", async ({ page }) => {
    await openView(page, FIXTURE.spreadView);

    const right = (await page.getByTestId(`page-canvas-${FIXTURE.innerRightPage}`).boundingBox())!;
    const left = (await page.getByTestId(`page-canvas-${FIXTURE.innerLeftPage}`).boundingBox())!;

    // Hebrew reads rightwards first, so page 2 is the one you meet first.
    expect(right.x).toBeGreaterThan(left.x);
  });

  test("the seam adds a whole SHEET — four pages — exactly where it sits", async ({ page }) => {
    // A saddle-stitched sheet is folded once and carries FOUR pages: two on its
    // outer face and two on its inner one (lib/domain/imposition.ts). Adding two
    // was the old rule and let an issue reach six pages, which cannot be folded
    // and stapled at all — it prints as eight with a blank BACK COVER.
    await expect(page.getByTestId("page-thumb-4")).toBeVisible();
    await expect(page.getByTestId("page-thumb-5")).toHaveCount(0);

    await page.getByTestId("seam-1").click();

    await expect(page.getByTestId("page-thumb-8")).toBeVisible();
    await expect(page.getByTestId("page-thumb-9")).toHaveCount(0);
    // The count stays foldable, which is the whole point of the number.
    await expect(page.getByTestId("page-thumb-4")).toBeVisible();
    // And the pair still reads as one spread, not as two half-empty views.
    await openView(page, FIXTURE.spreadView);
    await expect(page.getByTestId("pager-label")).toContainText("עמודים 2-3");
  });

  test("reorders by number only after two confirmations, and never before", async ({ page }) => {
    // The back page's TYPE ("אחורי" in the seed) is what makes the move visible on the strip: the
    // thumb's title carries it, and every inner page shares one type.
    await expect(page.getByTestId("page-thumb-2")).not.toHaveAttribute("title", /אחורי/);

    await page.getByTestId("open-page-order").click();
    await page.getByTestId("order-number-4").fill("2");
    await page.getByTestId("order-number-4").press("Enter");
    await expect(page.getByTestId("page-order-moved")).toContainText("עמודים זזו");

    // Proposed, not written: the strip under the dialog has not moved.
    await expect(page.getByTestId("page-thumb-2")).not.toHaveAttribute("title", /אחורי/);

    await page.getByTestId("apply-page-order").click();
    await expect(page.getByTestId("confirm-page-order")).toContainText("לשנות את סדר העמודים?");
    await page.getByTestId("confirm-page-order-confirm").click();

    // Wait for the dialog to go — it stays open for the whole write (CLAUDE.md).
    await expect(page.getByTestId("page-order-dialog")).toHaveCount(0);
    await expect(page.getByTestId("page-thumb-2")).toHaveAttribute("title", /אחורי/);
  });

  test("names the outside pages instead of numbering them", async ({ page }) => {
    // A seller asked which pages still have room wants to hear "the cover".
    //
    // Asserted as "contains the name, and is NOT numbered" rather than as exact
    // text: each chip also carries how much of that page is still free, which
    // is the other half of what the same seller is asking. Pinning the whole
    // string made the test about the chip's layout instead of about its claim.
    const alert = page.getByTestId("unfinished-alert");

    await expect(alert.getByTestId("jump-to-page-1")).toContainText("שער");
    await expect(alert.getByTestId("jump-to-page-1")).not.toContainText("עמוד 1");

    await expect(alert.getByTestId("jump-to-page-4")).toContainText("גב");
    await expect(alert.getByTestId("jump-to-page-4")).not.toContainText("עמוד 4");

    // An inner page has no name to be called by, so it keeps its number.
    await expect(alert.getByTestId("jump-to-page-2")).toContainText("עמוד 2");

    // And every chip says what is left to sell there — the number a seller
    // quotes down the phone (asked for 06/09/2026).
    await expect(alert.getByTestId("jump-to-page-1")).toContainText("% פנוי");
  });

  test("lists the shapes the open page allows, and strikes out what no longer fits", async ({
    page,
  }) => {
    await openView(page, FIXTURE.spreadView);
    const panel = page.getByTestId(`allowed-shapes-${FIXTURE.innerRightPage}`);
    await expect(panel).toContainText("רבע עמוד");
    await expect(panel).toContainText("ס״מ");

    // Fill the page with a full-page ad; everything else stops fitting.
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.full}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await expect(panel.locator('li[data-fits="true"]')).toHaveCount(0);
  });

  test("keeps the whole spread on screen, with nothing to scroll to", async ({ page }) => {
    // A newspaper page is TALL. Sized by the width available to it, it runs off
    // the bottom — and the more room the board is given, the worse that gets,
    // so collapsing the sidebar used to make the page overflow further.
    await openView(page, FIXTURE.spreadView);

    const overflow = async () =>
      page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      );

    // The board arrives with the rail collapsed, because it needs the room.
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "true");
    await expect.poll(overflow).toBeLessThanOrEqual(1);

    // And opening the menu anyway does not push the page off the bottom: the
    // spread is sized by the height it has, not by the width it is given.
    await page.getByTestId("sidebar-toggle").click();
    await expect(page.getByTestId("sidebar-rail")).toHaveAttribute("data-collapsed", "false");
    await expect.poll(overflow).toBeLessThanOrEqual(1);
  });

  test("draws the allowed shapes instead of only naming them", async ({ page }) => {
    await openView(page, FIXTURE.spreadView);
    const list = page.getByTestId(`allowed-shapes-list-${FIXTURE.innerRightPage}`);

    // A picture of the footprint, not a line of text: "half a page across" and
    // "half a page down" are the same words and the same area, and they are not
    // the same offer to a customer.
    await expect(list.locator("li[data-shape]").first()).toBeVisible();
    await expect(list.locator("li[data-shape]")).not.toHaveCount(0);
  });

  test("refuses to remove a page that still has an ad on it", async ({ page }) => {
    await openView(page, FIXTURE.spreadView);
    await page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.quarterA}`).click();
    await page.getByTestId(`board-cell-${FIXTURE.innerRightPage}-0-0`).click();
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);

    await page.getByTestId("remove-page").click();

    await expect(page.getByTestId("board-message")).toContainText("שיבוצים");
    await expect(page.locator('[data-testid^="placement-"]')).toHaveCount(1);
  });
});
