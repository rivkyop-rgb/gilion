import { expect, test, type Page } from "@playwright/test";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

import { NEWSPAPERS, loginAsAdmin } from "./helpers";
import {
  ISSUE_FIXTURES,
  boardUrl,
  leaveOnlyOnePlaceable,
  resetFixtureIssue,
} from "./issue-helpers";

/** One click — where it may place is the newspaper's setting (27/09/2026). */
async function runAutoPlace(page: Page) {
  await page.getByTestId("auto-place").click();
}

/**
 * Filling an issue by itself (backlog item 4).
 *
 * `prd.md` left automatic placement out of the MVP; it came back as an explicit
 * request, with the decision that makes it tractable: the issue GROWS until
 * everything fits. So there is no "what do we leave out" to design — only a
 * page count to report.
 */
test.describe("automatic placement", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureIssue();
    await loginAsAdmin(page);
    await page.goto(boardUrl);
  });

  test("places everything that has usable artwork, and leaves the rest alone", async ({ page }) => {
    // Six publications wait: four with usable artwork, two blocked (no ad, and
    // an ad belonging to nobody). The packer may only take the four.
    await expect(page.getByTestId("unplaced-count")).toHaveText("(6)");

    await runAutoPlace(page);

    await expect(page.getByTestId("board-message")).toContainText("שובצו");
    await expect(page.getByTestId("placed-count")).toHaveText("(4)");
    // The two that could never be placed are still waiting, and still blocked.
    await expect(page.getByTestId("unplaced-count")).toHaveText("(2)");
    await expect(page.getByTestId(`unplaced-item-${ISSUE_FIXTURES.noAd}`)).toBeDisabled();
  });

  test("grows the issue when what is waiting does not fit", async ({ page }) => {
    const before = await page.getByTestId("page-strip").getByRole("listitem").count();

    await runAutoPlace(page);
    await expect(page.getByTestId("placed-count")).toHaveText("(4)");

    // A full page, two quarters and a strip do not fit on one cover, one back
    // and a single inner spread — so sheets were opened for them.
    const after = await page.getByTestId("page-strip").getByRole("listitem").count();
    expect(after).toBeGreaterThanOrEqual(before);
    // And whatever it did, it said so.
    await expect(page.getByTestId("board-message")).toContainText("שובצו 4 פרסומים");
  });

  test("says what it did, as news rather than as an error", async ({ page }) => {
    await runAutoPlace(page);

    const message = page.getByTestId("board-message");
    await expect(message).toContainText("שובצו 4 פרסומים");
    // "4 placed, 2 pages opened" is not a failure, and painting it red teaches
    // people to read every notice on the board as one.
    await expect(message).toHaveAttribute("data-ok", "true");
  });

  test("another arrangement empties the board and packs it again", async ({ page }) => {
    await runAutoPlace(page);
    await expect(page.getByTestId("placed-count")).toHaveText("(4)");

    // Deterministic: asking for the same thing gives the same thing, so there
    // is always a way back. Asking for ANOTHER is an explicit act — and once
    // everything is placed, the only thing it can honestly mean is "clear it
    // and pack it again", which also undoes hand-placed ads. So it says so.
    await page.getByTestId("auto-place-reshuffle").click();
    await expect(page.getByTestId("reshuffle")).toContainText("כולל מודעות ששובצו ביד");
    await page.getByTestId("reshuffle-confirm").click();

    // The dialog stays open until the action returns, so its disappearance is
    // the completion signal. Waiting for it matters beyond this test: without
    // it the repack is still writing while the NEXT test resets the fixture,
    // and the placements land after the reset — a failure that surfaces in a
    // different test entirely.
    await expect(page.getByTestId("reshuffle")).toHaveCount(0);

    // Same ads, board full again. That the arrangement itself differs per seed
    // is arithmetic, and is pinned in lib/domain/auto-place.test.ts.
    await expect(page.getByTestId("board-message")).toContainText("שובצו 4 פרסומים");
    await expect(page.getByTestId("placed-count")).toHaveText("(4)");
    await expect(page.getByTestId("unplaced-count")).toHaveText("(2)");
  });

  test("is not offered once there is nothing left to place", async ({ page }) => {
    await runAutoPlace(page);
    await expect(page.getByTestId("placed-count")).toHaveText("(4)");

    // Only the two blocked ones remain, and the packer cannot take those — so
    // offering the button would be offering an action that does nothing.
    await expect(page.getByTestId("auto-place")).toHaveCount(0);
  });
});

/**
 * "שובצו 1 פרסומים" is not Hebrew, and one is the number a fixture never has.
 *
 * The board fixture places four at a time, so the singular went unseen through
 * every run until an issue happened to hold a single ad. Reported 06/09/2026.
 */
test("says it in Hebrew when exactly one ad goes down", async ({ page }) => {
  await resetFixtureIssue();
  await leaveOnlyOnePlaceable();

  await loginAsAdmin(page);
  await page.goto(boardUrl);
  await runAutoPlace(page);

  const message = page.getByTestId("board-message");
  await expect(message).toContainText("שובץ פרסום אחד");
  await expect(message).not.toContainText("1 פרסומים");
});

/**
 * Where there is still room must survive the success that just filled some.
 *
 * The notice and the "still room to sell" line took turns in one row and the
 * notice always won — so the line vanished at the exact moment somebody wants
 * it, right after auto-placement. Reported 06/09/2026.
 */
test("still says where there is room, right after placing", async ({ page }) => {
  await resetFixtureIssue();
  await loginAsAdmin(page);
  await page.goto(boardUrl);

  await runAutoPlace(page);
  await expect(page.getByTestId("board-message")).toContainText("שובצו");

  // Same row, same breath: what happened, and what is left to sell.
  const room = page.getByTestId("unfinished-after-notice");
  await expect(room).toBeVisible();
  await expect(room).toContainText("עדיין יש מקום למכור");
  // Free, not full — the number a seller quotes down the phone.
  await expect(room).toContainText("% פנוי");
});

test.describe("where it may place — the newspaper's setting (27/09/2026)", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const allTypesOpen = () =>
    prisma.pageType.updateMany({
      where: { newspaper_id: NEWSPAPERS.alpha },
      data: { auto_place: true, auto_grow: false },
    });

  test.beforeEach(async ({ page }) => {
    await allTypesOpen();
    await resetFixtureIssue();
    await loginAsAdmin(page);
  });
  test.afterEach(allTypesOpen);
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("only the page types opened in the settings receive ads", async ({ page }) => {
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);
    await page.getByTestId("auto-place-type-שער").uncheck();
    await page.getByTestId("auto-place-type-אחורי").uncheck();
    await page.getByTestId("save-auto-place").click();
    await expect(page.getByTestId("auto-place-saved")).toBeVisible();

    await page.goto(boardUrl);
    await expect(page.getByTestId("auto-place-scope")).toContainText("פנימי");
    await expect(page.getByTestId("auto-place-scope")).not.toContainText("שער");
    await runAutoPlace(page);
    await expect(page.getByTestId("board-message")).toContainText("שובצו");

    // Nothing on the cover or the back — asked of the database, not the screen.
    const outside = await prisma.placement.count({
      where: {
        issue_id: ISSUE_FIXTURES.issue,
        status: "placed",
        page: { page_type: { name: { in: ["שער", "אחורי"] } } },
      },
    });
    expect(outside).toBe(0);
  });

  test("the added type must itself be open to auto-placement", async ({ page }) => {
    await page.goto(`/settings/newspapers/${NEWSPAPERS.alpha}`);
    await page.getByTestId("auto-grow-type-פנימי").check();
    await page.getByTestId("auto-place-type-פנימי").uncheck();
    // Unticking the type clears it as the one to grow with.
    await expect(page.getByTestId("auto-grow-type-פנימי")).not.toBeChecked();
    await expect(page.getByTestId("auto-grow-type-פנימי")).toBeDisabled();
  });
});
