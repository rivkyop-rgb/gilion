import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, type Page } from "@playwright/test";

import { BOARD_DATE, ISSUE_FIXTURES, OPEN_DATE } from "./global-setup";

export { BOARD_DATE, ISSUE_FIXTURES, OPEN_DATE };

/**
 * Puts the fixture issue back the way global-setup left it.
 *
 * The placement specs run against ONE issue, because the whole point of the
 * board is a page with other ads already on it — and a per-spec issue would
 * mean a per-spec order, customer and set of ads to go with it. What that buys
 * has to be paid for here: an issue mutated by the previous test is exactly the
 * "the first row is not what the spec thinks it is" failure CLAUDE.md warns
 * about, and a retry does NOT re-run global setup.
 *
 * So this is called in beforeEach, not afterEach: a test that fails half way
 * through cleans up nothing, and the next one still has to start from a known
 * page.
 */
export async function resetFixtureIssue() {
  const prisma = client();
  try {
    await prisma.placement.deleteMany({ where: { issue_id: ISSUE_FIXTURES.issue } });
    // The pages are fixture state too: issue-pages.spec.ts adds and removes
    // them, and a stray page renumbers everything after it — so "page 2" stops
    // being the cover for every other spec in the run.
    //
    // Rebuilt rather than renumbered in place, because renumbering has to pass
    // through states the unique index on (issue_id, page_number) forbids. The
    // placements are already gone by this line, so nothing cascades.
    await prisma.issuePage.deleteMany({ where: { issue_id: ISSUE_FIXTURES.issue } });
    await prisma.issuePage.createMany({
      data: [
        { id: ISSUE_FIXTURES.pageCover, page_type_id: "pt_cover", page_number: 1 },
        { id: ISSUE_FIXTURES.pageInnerA, page_type_id: "pt_inner", page_number: 2 },
        { id: ISSUE_FIXTURES.pageInnerB, page_type_id: "pt_inner", page_number: 3 },
        { id: ISSUE_FIXTURES.pageBack, page_type_id: "pt_back", page_number: 4 },
      ].map((p) => ({ ...p, issue_id: ISSUE_FIXTURES.issue })),
    });
    // The DATE is fixture state too, and the least obvious kind.
    // issue-lifecycle.spec.ts moves the issue to another day on purpose, and
    // the move takes the publications with it — so without this the fixture
    // silently lives on a different date for the rest of the run, and every
    // later spec measures a board that is empty for a reason nothing explains.
    //
    // Anything else sitting on the fixture's own date goes first: the issue is
    // unique per (newspaper, date), so restoring onto an occupied day would
    // fail rather than reset.
    await prisma.issue.deleteMany({
      where: {
        newspaper_id: "paper_alpha",
        issue_date: new Date(BOARD_DATE),
        id: { not: ISSUE_FIXTURES.issue },
      },
    });
    await prisma.issue.update({
      where: { id: ISSUE_FIXTURES.issue },
      data: { issue_date: new Date(BOARD_DATE), status: "in_layout", closed_at: null },
    });
    // Placement moves the publication's status, so putting the placements back
    // without putting the statuses back would leave a board whose right-hand
    // panel disagrees with its canvas.
    //
    // The artwork links are fixture state too, and less obviously so:
    // board-upload.spec.ts uploads a real file onto the publication that is
    // supposed to have none, and that link SURVIVES. Left alone, every later
    // spec that asserts "אין מודעה" measures a publication a previous file
    // fixed — and the failure surfaces in placement-ad-no-customer, two files
    // away, as an item that is inexplicably enabled.
    for (const [id, adId] of [
      [ISSUE_FIXTURES.quarterA, ISSUE_FIXTURES.adOk],
      [ISSUE_FIXTURES.quarterB, ISSUE_FIXTURES.adOk],
      [ISSUE_FIXTURES.strip, ISSUE_FIXTURES.adOk],
      [ISSUE_FIXTURES.full, ISSUE_FIXTURES.adOk],
      [ISSUE_FIXTURES.noAd, null],
      [ISSUE_FIXTURES.orphanAd, ISSUE_FIXTURES.adOrphan],
    ] as Array<[string, string | null]>) {
      await prisma.publication.update({
        where: { id },
        data: {
          // Back to the fixture date, for the same reason the issue is.
          publication_date: new Date(BOARD_DATE),
          advertisement_id: adId,
          status:
            adId === ISSUE_FIXTURES.adOk ? "ready_for_layout" : adId ? "ad_received" : "missing_ad",
          placement_status: "not_placed",
        },
      });
    }

    // The order lines moved with the publications, so they come back too.
    await prisma.adOrderItem.updateMany({
      where: { order_id: ISSUE_FIXTURES.order },
      data: { publication_date: new Date(BOARD_DATE) },
    });

    // Everything a SALE from the board left behind: the publication, the order
    // that created it, and the walk-in customer it was sold to.
    //
    // This is the same trap as the artwork links above, one level up. A sale
    // adds a real publication on the fixture date, and a publication lands on
    // the board by (newspaper, date) alone — so the next spec counts one more
    // than it expects, and fails in placement-happy-path as "expected (5),
    // received (6)" with nothing about a sale anywhere near it.
    const strayPublications = await prisma.publication.findMany({
      where: {
        business_id: "biz_alpha",
        newspaper_id: "paper_alpha",
        publication_date: new Date(BOARD_DATE),
        id: { notIn: FIXTURE_PUBLICATION_IDS },
      },
      select: { id: true, order_id: true, customer_id: true },
    });
    if (strayPublications.length > 0) {
      const orderIds = [...new Set(strayPublications.map((p) => p.order_id))];
      const customerIds = [...new Set(strayPublications.map((p) => p.customer_id))];

      await prisma.publication.deleteMany({
        where: { id: { in: strayPublications.map((p) => p.id) } },
      });
      await prisma.adOrderItem.deleteMany({ where: { order_id: { in: orderIds } } });
      await prisma.adOrder.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.auditLog.deleteMany({
        where: { target_type: "AdOrder", target_id: { in: orderIds } },
      });

      // Only the walk-ins this created: prisma/seed.ts gives every customer it
      // makes a `cust_` id, and one with nothing left pointing at it is a row
      // that only ever existed for the sale just undone.
      await prisma.customer.deleteMany({
        where: {
          id: { in: customerIds, notIn: [] },
          NOT: { id: { startsWith: "cust_" } },
          ad_orders: { none: {} },
          publications: { none: {} },
          advertisements: { none: {} },
        },
      });
    }

    // The uploaded file itself, now that nothing points at it. Scoped to this
    // business and to the two ids the fixture owns, so a spec elsewhere in the
    // run keeps its own uploads.
    await prisma.advertisement.deleteMany({
      where: {
        business_id: "biz_alpha",
        id: { notIn: [ISSUE_FIXTURES.adOk, ISSUE_FIXTURES.adOrphan] },
        publications: { none: {} },
        ad_orders: { none: {} },
        placements: { none: {} },
      },
    });
    // Every override approved by the duplicate spec goes with them.
    await prisma.auditLog.deleteMany({
      where: { action: "override_duplicate_placement", target_id: ISSUE_FIXTURES.quarterA },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Removes any issue on the "open a new issue" date, so the spec can re-run. */
export async function clearIssuesOn(date: string) {
  const prisma = client();
  try {
    const issues = await prisma.issue.findMany({
      where: { issue_date: new Date(date) },
      select: { id: true },
    });
    const ids = issues.map((i) => i.id);
    if (ids.length === 0) return;
    await prisma.placement.deleteMany({ where: { issue_id: { in: ids } } });
    await prisma.issuePage.deleteMany({ where: { issue_id: { in: ids } } });
    await prisma.issue.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Removes every reserved area (backlog item 14).
 *
 * prisma/seed.ts creates none, so anything here was drawn by a spec — and one
 * left behind takes a slice of the cover out of the market for every placement
 * spec that follows, which reads as "the ad will not go where it always goes".
 * The issue-level COPIES are left alone on purpose: they belong to issues that
 * were already laid out, and removing them here would be exactly the retroactive
 * edit the snapshot exists to prevent.
 */
export async function clearReservations() {
  const prisma = client();
  try {
    await prisma.pageReservation.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

/** Forces the fixture issue into a status the UI has no button for. */
export async function setFixtureIssueStatus(
  status: "draft" | "in_layout" | "ready_for_print" | "closed",
) {
  const prisma = client();
  try {
    await prisma.issue.update({ where: { id: ISSUE_FIXTURES.issue }, data: { status } });
  } finally {
    await prisma.$disconnect();
  }
}

function client() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
}

export const boardUrl = `/issues/${ISSUE_FIXTURES.issue}/board`;

/** The six publications the fixture owns. Anything else on the date is a stray. */
const FIXTURE_PUBLICATION_IDS = [
  ISSUE_FIXTURES.quarterA,
  ISSUE_FIXTURES.quarterB,
  ISSUE_FIXTURES.strip,
  ISSUE_FIXTURES.full,
  ISSUE_FIXTURES.noAd,
  ISSUE_FIXTURES.orphanAd,
];

/**
 * The fixture issue by PAGE NUMBER, and which view each page is on.
 *
 * The board groups pages the way a printed issue folds: the cover and the back
 * are alone, and everything between them is paired. So "page 2" is not view 2 —
 * it is the right-hand half of view 1, and a spec that wants to place something
 * there has to open that view first.
 */
export const FIXTURE = {
  coverPage: 1,
  innerRightPage: 2,
  innerLeftPage: 3,
  backPage: 4,
  coverView: 0,
  spreadView: 1,
  backView: 2,
} as const;

/**
 * Types the date into the "open an issue" form and waits for the app to have
 * taken it — not merely for the DOM to be holding it.
 *
 * The wait is on the live preview leaving its empty state, because that is the
 * one thing that can only be true once the value reached React. Filling a
 * field and reading it straight back proves nothing: the value is in the
 * element either way, and the case worth catching is exactly the one where it
 * is in the element and nowhere else.
 *
 * That case is a product bug and is fixed in the form itself (`adoptTypedDate`
 * in new-issue-form.tsx); this assertion is what would notice if it came back.
 */
export async function setIssueDate(page: Page, date: string) {
  await page.getByTestId("issue-date").fill(date);
  await expect(page.getByTestId("issue-preview")).not.toContainText("בחרי תאריך");
}

/** Opens one of the issue's views — a cover, a spread, or the back. */
export async function openView(page: Page, index: number) {
  await page.getByTestId(`view-tab-${index}`).click();
}

/** Selects an unplaced publication and drops it on one cell of one page. */
export async function placeAt(
  page: Page,
  publicationId: string,
  pageNumber: number,
  col: number,
  row: number,
) {
  await page.getByTestId(`unplaced-item-${publicationId}`).click();
  await page.getByTestId(`board-cell-${pageNumber}-${col}-${row}`).click();
}

/** Waits for the board to finish reloading after a successful placement. */
export async function expectPlacedCount(page: Page, unplaced: number) {
  await expect(page.getByTestId("unplaced-count")).toHaveText(`(${unplaced})`);
}
