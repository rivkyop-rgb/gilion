import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, type Page } from "@playwright/test";

import { BOARD_DATE, CLOSE_DATE, ISSUE_FIXTURES, OPEN_DATE } from "./global-setup";

export { BOARD_DATE, CLOSE_DATE, ISSUE_FIXTURES, OPEN_DATE };

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

    // Stage 08: closing an issue publishes its publications, which is exactly
    // the event that re-derives the order's payment status. The close specs run
    // that transition, so the fixture order has to start from "nothing paid"
    // again — otherwise the FIRST close of a run leaves a status the later
    // billing assertions never chose. Deleting the records as well, because the
    // status is derived from them and restoring one without the other would
    // produce a row the domain layer disagrees with.
    await prisma.payment.deleteMany({ where: { order_id: ISSUE_FIXTURES.order } });
    await prisma.adOrder.update({
      where: { id: ISSUE_FIXTURES.order },
      data: { payment_status: "unpaid" },
    });
    await prisma.publication.updateMany({
      where: { order_id: ISSUE_FIXTURES.order },
      data: { payment_status: "unpaid" },
    });
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
          // Payment → Customer is Restrict, so a record left pointing here
          // turns this cleanup into a foreign-key error in a file about
          // placement.
          payments: { none: {} },
        },
      });
    }

    // The uploaded file itself, now that nothing points at it. Scoped to this
    // business and to the two ids the fixture owns, so a spec elsewhere in the
    // run keeps its own uploads.
    await prisma.advertisement.deleteMany({
      where: {
        business_id: "biz_alpha",
        id: {
          notIn: [ISSUE_FIXTURES.adOk, ISSUE_FIXTURES.adOrphan, ISSUE_FIXTURES.adBroken],
        },
        publications: { none: {} },
        ad_orders: { none: {} },
        placements: { none: {} },
      },
    });
    // Every override approved by the duplicate spec goes with them.
    await prisma.auditLog.deleteMany({
      where: { action: "override_duplicate_placement", target_id: ISSUE_FIXTURES.quarterA },
    });
    // And the generation trail: the check screen shows the log, and a row from
    // a previous run makes "the first entry" mean something else (stage 07).
    await prisma.pdfGenerationLog.deleteMany({ where: { issue_id: ISSUE_FIXTURES.issue } });
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

/* ------------------------------------------------- stage 07: check and close */

export const closeIssueUrl = `/issues/${ISSUE_FIXTURES.closeIssue}/validate`;
export const checkUrl = `/issues/${ISSUE_FIXTURES.issue}/validate`;

/**
 * Puts the CLOSE fixture back the way global-setup left it.
 *
 * Everything a close changes has to come back, and the list is longer than it
 * looks: the issue's status and its `final_pdf_url`, the placement's status
 * (closing marks it `published`, and a published placement is not one a second
 * close spec can start from), the publication's status, the generation log —
 * and the object in MinIO, because the next run of issue-draft-pdf.spec.ts
 * asserts that a draft writes NOTHING under this business's issues/ prefix.
 *
 * beforeEach and not afterEach, for the reason at the top of this file: a spec
 * that dies half way through cleans up nothing, and a retry does not re-run the
 * global setup.
 */
export async function resetCloseIssue() {
  const prisma = client();
  try {
    const shape = await prisma.adShape.findUnique({ where: { id: "shape_quarter" } });
    if (!shape) throw new Error("shape_quarter is missing — has the seed run?");

    await prisma.pdfGenerationLog.deleteMany({ where: { issue_id: ISSUE_FIXTURES.closeIssue } });
    await prisma.placement.deleteMany({ where: { issue_id: ISSUE_FIXTURES.closeIssue } });
    await prisma.issuePage.deleteMany({ where: { issue_id: ISSUE_FIXTURES.closeIssue } });

    const paper = await prisma.newspaper.findUniqueOrThrow({ where: { id: "paper_alpha" } });
    await prisma.issue.update({
      where: { id: ISSUE_FIXTURES.closeIssue },
      data: {
        issue_date: new Date(CLOSE_DATE),
        status: "in_layout",
        closed_at: null,
        final_pdf_url: null,
        // Both files, or the next test asks for a press sheet whose row still
        // points at an object this helper just deleted — and the route answers
        // 404 for a reason that has nothing to do with the test.
        press_pdf_url: null,
        // The grid is fixture state as well: pdf-rollback.spec.ts breaks it on
        // purpose to make the render fail, and a broken grid left behind fails
        // every later close for a reason that reads as a product bug.
        page_size: paper.page_size,
        custom_width_mm: paper.custom_width_mm,
        custom_height_mm: paper.custom_height_mm,
        margin: paper.margin,
        columns: paper.columns,
        row_height_mm: paper.row_height_mm,
        gutter_mm: paper.gutter_mm,
      },
    });

    await prisma.issuePage.createMany({
      // Four, because a saddle-stitched issue folds in sheets of four. Two was
      // not a newspaper anybody could bind (lib/domain/imposition.ts).
      data: [
        { id: ISSUE_FIXTURES.closePageCover, page_type_id: "pt_cover", page_number: 1 },
        { id: ISSUE_FIXTURES.closePageInner, page_type_id: "pt_inner", page_number: 2 },
        { id: ISSUE_FIXTURES.closePageInnerB, page_type_id: "pt_inner", page_number: 3 },
        { id: ISSUE_FIXTURES.closePageBack, page_type_id: "pt_back", page_number: 4 },
      ].map((p) => ({ ...p, issue_id: ISSUE_FIXTURES.closeIssue })),
    });

    // Anything a spec sold onto this date goes: a publication lands on a board
    // by (newspaper, date) alone, so a stray one is an unplaced publication and
    // an unplaced publication is a blocking finding.
    await prisma.publication.deleteMany({
      where: {
        newspaper_id: "paper_alpha",
        publication_date: new Date(CLOSE_DATE),
        id: { not: ISSUE_FIXTURES.closePublication },
      },
    });

    await prisma.publication.update({
      where: { id: ISSUE_FIXTURES.closePublication },
      data: {
        publication_date: new Date(CLOSE_DATE),
        advertisement_id: ISSUE_FIXTURES.adOk,
        status: "placed",
        placement_status: "placed",
      },
    });

    await prisma.placement.create({
      data: {
        id: ISSUE_FIXTURES.closePlacement,
        issue_id: ISSUE_FIXTURES.closeIssue,
        issue_page_id: ISSUE_FIXTURES.closePageCover,
        publication_id: ISSUE_FIXTURES.closePublication,
        advertisement_id: ISSUE_FIXTURES.adOk,
        ad_shape_id: "shape_quarter",
        col: 0,
        row: 0,
        cols: shape.cols,
        rows: shape.rows,
        status: "placed",
      },
    });

    // Stage 08: closing an issue publishes its publications, which is exactly
    // the event that re-derives the order's payment status. The close specs run
    // that transition, so the fixture order has to start from "nothing paid"
    // again — otherwise the FIRST close of a run leaves a status the later
    // billing assertions never chose. Deleting the records as well, because the
    // status is derived from them and restoring one without the other would
    // produce a row the domain layer disagrees with.
    await prisma.payment.deleteMany({ where: { order_id: ISSUE_FIXTURES.order } });
    await prisma.adOrder.update({
      where: { id: ISSUE_FIXTURES.order },
      data: { payment_status: "unpaid" },
    });
    await prisma.publication.updateMany({
      where: { order_id: ISSUE_FIXTURES.order },
      data: { payment_status: "unpaid" },
    });

    await clearIssueObjects(ISSUE_FIXTURES.closeIssue);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Six of the seven findings, on the board fixture, in one go.
 *
 * Seeded through Prisma and not through the board, because that is the only way
 * to reach them: the placement rules refuse five of these before they are
 * written, which is exactly what stage 06 is for. Finding 3 in particular can
 * only happen to an ad that went bad AFTER it was placed, and no sequence of
 * clicks produces that inside one test.
 *
 * The seventh — a geometric overlap — is deliberately absent. `placement_no_overlap`
 * is an EXCLUDE constraint, so the database refuses the row whichever way it is
 * written, from the UI or from here. It is covered in
 * lib/domain/issue-validation.test.ts, where the rule can be asked directly.
 */
export async function seedFindingPlacements() {
  const prisma = client();
  try {
    const shapes = new Map(
      (await prisma.adShape.findMany({ where: { newspaper_id: "paper_alpha" } })).map((s) => [
        s.id,
        s,
      ]),
    );
    const at = (id: string) => shapes.get(id)!;

    const rows = [
      // Finding 2 — the ad on the page belongs to nobody.
      {
        id: "plc_finding_orphan",
        page: ISSUE_FIXTURES.pageInnerA,
        publication_id: ISSUE_FIXTURES.orphanAd,
        advertisement_id: ISSUE_FIXTURES.adOrphan,
        shape: "shape_quarter",
        col: 0,
        row: 0,
      },
      // Finding 3 — the right customer's ad, and it never passed validation.
      {
        id: "plc_finding_broken",
        page: ISSUE_FIXTURES.pageInnerA,
        publication_id: ISSUE_FIXTURES.noAd,
        advertisement_id: ISSUE_FIXTURES.adBroken,
        shape: "shape_quarter",
        col: at("shape_quarter").cols,
        row: 0,
      },
      // Finding 4 — the same publication twice. The partial unique index allows
      // this pair precisely because one of them carries the override; what it
      // forbids is two UNapproved rows. An issue where only SOME copies were
      // approved is the state the check is here to catch.
      {
        id: "plc_finding_dup_a",
        page: ISSUE_FIXTURES.pageInnerB,
        publication_id: ISSUE_FIXTURES.quarterA,
        advertisement_id: ISSUE_FIXTURES.adOk,
        shape: "shape_quarter",
        col: 0,
        row: 0,
      },
      {
        id: "plc_finding_dup_b",
        page: ISSUE_FIXTURES.pageInnerB,
        publication_id: ISSUE_FIXTURES.quarterA,
        advertisement_id: ISSUE_FIXTURES.adOk,
        shape: "shape_quarter",
        col: at("shape_quarter").cols,
        row: 0,
        duplicate_override_approved: true,
      },
      // Finding 6 — a full page on a cover, which accepts only two shapes.
      {
        id: "plc_finding_shape",
        page: ISSUE_FIXTURES.pageCover,
        publication_id: ISSUE_FIXTURES.full,
        advertisement_id: ISSUE_FIXTURES.adOk,
        shape: "shape_full",
        col: 0,
        row: 0,
      },
    ];

    for (const row of rows) {
      await prisma.placement.create({
        data: {
          id: row.id,
          issue_id: ISSUE_FIXTURES.issue,
          issue_page_id: row.page,
          publication_id: row.publication_id,
          advertisement_id: row.advertisement_id,
          ad_shape_id: row.shape,
          col: row.col,
          row: row.row,
          cols: at(row.shape).cols,
          rows: at(row.shape).rows,
          status: "placed",
          duplicate_override_approved: row.duplicate_override_approved ?? false,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Drops a publication onto CLOSE_DATE that nobody has placed.
 *
 * Simulates the one thing that turns a closeable issue into a blocked one
 * without anybody touching the issue: an order approved in another room, on the
 * day this issue is for. A publication lands on a board by (newspaper, date)
 * alone, so this is all it takes.
 */
export async function addStrayPublication() {
  const prisma = client();
  try {
    await prisma.publication.create({
      data: {
        business_id: "biz_alpha",
        order_id: ISSUE_FIXTURES.order,
        customer_id: "cust_alpha_1",
        newspaper_id: "paper_alpha",
        ad_shape_id: "shape_eighth",
        advertisement_id: ISSUE_FIXTURES.adOk,
        publication_date: new Date(CLOSE_DATE),
        price: 900,
        source: "internal",
        status: "ready_for_layout",
        placement_status: "not_placed",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Leaves exactly ONE publication the auto-placer can take.
 *
 * The singular is the case a fixture never produces: the board fixture holds
 * four placeable ads and every count message therefore came out plural, which
 * is how "שובצו 1 פרסומים" survived to production. Cancelling rather than
 * deleting — a cancelled publication is a state the product has, and
 * resetFixtureIssue puts the statuses back.
 */
export async function leaveOnlyOnePlaceable() {
  const prisma = client();
  try {
    await prisma.publication.updateMany({
      where: {
        id: { in: [ISSUE_FIXTURES.quarterB, ISSUE_FIXTURES.strip, ISSUE_FIXTURES.full] },
      },
      data: { status: "canceled" },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Breaks an issue's grid snapshot, so the renderer cannot produce a page. */
export async function breakIssueGrid(issueId: string) {
  const prisma = client();
  try {
    await prisma.issue.update({
      where: { id: issueId },
      // "custom" with no dimensions: deriveGrid returns null and toPrintModel
      // refuses. A render that fails for a reason the DATA explains, rather
      // than by killing a browser out from under the test.
      data: { page_size: "custom", custom_width_mm: null, custom_height_mm: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** What the issue looks like now — the assertions no screen can make. */
export async function issueState(issueId: string) {
  const prisma = client();
  try {
    const issue = await prisma.issue.findUniqueOrThrow({
      where: { id: issueId },
      include: {
        placements: { select: { id: true, status: true, publication_id: true } },
        pdf_logs: { orderBy: { generated_at: "desc" } },
      },
    });
    const publications = await prisma.publication.findMany({
      where: { id: { in: issue.placements.map((p) => p.publication_id) } },
      select: { id: true, status: true },
    });
    return { issue, publications };
  } finally {
    await prisma.$disconnect();
  }
}

/** Object keys under one issue's prefix — how a spec proves a draft saved nothing. */
export async function issueObjectKeys(issueId: string, businessId = "biz_alpha") {
  const { Client } = await import("minio");
  const minio = new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
  const bucket = process.env.MINIO_BUCKET!;
  if (!(await minio.bucketExists(bucket))) return [];

  const keys: string[] = [];
  const stream = minio.listObjectsV2(bucket, `${businessId}/issues/${issueId}/`, true);
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (o) => o.name && keys.push(o.name));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
  return keys;
}

async function clearIssueObjects(issueId: string, businessId = "biz_alpha") {
  const keys = await issueObjectKeys(issueId, businessId);
  if (keys.length === 0) return;
  const { Client } = await import("minio");
  const minio = new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
  await minio.removeObjects(process.env.MINIO_BUCKET!, keys);
}

/**
 * Opens the board's details panel. It is closed by default since 27/09/2026 —
 * the page takes that room — and opens only by a click, never by itself
 * (opening it resizes the page, which must not happen under the pointer).
 */
export async function openDetails(page: Page) {
  const toggle = page.getByTestId("toggle-details");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.getByTestId("toggle-details")).toHaveAttribute("aria-expanded", "true");
}
