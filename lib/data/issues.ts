/**
 * Issues and their pages (US-007, FR-6, FR-14).
 *
 * Everything here is tenant-scoped: `Issue` carries business_id directly and
 * `IssuePage` reaches it through the issue (conventions.md §2).
 *
 * The one idea worth reading twice is the GRID SNAPSHOT. `createIssue` copies
 * the newspaper's page division onto the issue and nothing ever reads it from
 * `Newspaper` again — so a publisher who re-columns their paper in November
 * does not silently re-flow October's issue, which is already at the printer
 * (conventions.md §7 rule 2).
 */
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import { gridOf, type NewspaperRow } from "./newspapers";
import { readAllowedCells } from "./ad-shapes";
import type { DerivedGrid } from "@/lib/domain/grid";
import { ON_PAGE_STATES, type ReservedArea, type ShapeSpec } from "@/lib/domain/placement";
import { isBackward, transition, type IssueStatus } from "@/lib/domain/issue-status";
import {
  PAGES_PER_SHEET,
  defaultPageTypeIds,
  pageFill,
  sheetToRemove,
} from "@/lib/domain/issue-layout";
import { AUTO_OPEN_DAYS, autoOpenDates } from "@/lib/domain/issue-schedule";
import { addDays, isoDay, jerusalemDay } from "@/lib/domain/calendar";
import { OPEN_ISSUE_STATES } from "@/lib/domain/dashboard";
import { withAudit } from "./audit";
import { overlaps } from "@/lib/domain/slot-geometry";

/** yyyy-mm-dd, in UTC — the form a @db.Date column round-trips unchanged. */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The issue's own grid.
 *
 * `Issue` carries exactly the seven columns `NewspaperRow` names, which is why
 * one function serves both: the snapshot is not a different KIND of grid, it is
 * the same grid frozen at a moment. Two derivation paths would be two places
 * for the print output to disagree with the board.
 */
export function gridOfIssue(issue: NewspaperRow): DerivedGrid | null {
  return gridOf(issue);
}

/* ------------------------------------------------------------------ reading */

/**
 * Every issue, without the per-issue counts — cheap enough to filter, search
 * and page in memory. The counts are then fetched for the one page shown.
 */
export async function issueSummaries(businessId: string, take = 1000) {
  return tenantDb(businessId).issue.findMany({
    orderBy: [{ issue_date: "desc" }],
    include: {
      newspaper: { select: { id: true, name: true } },
      _count: { select: { pages: true } },
    },
    take,
  });
}

export async function withPlacementCounts(
  businessId: string,
  issues: Awaited<ReturnType<typeof issueSummaries>>,
) {
  // "X of Y placed" per card, in two grouped queries rather than two per card.
  // A count per issue is the shape that quietly turns a list of forty into
  // eighty round trips, and it does not announce itself — the page merely gets
  // slower as the publisher works through the year.
  const ids = issues.map((i) => i.id);

  const placed = await tenantDb(businessId).placement.groupBy({
    by: ["issue_id"],
    where: { issue_id: { in: ids }, status: { in: ON_PAGE_STATES } },
    _count: { _all: true },
  });
  const placedBy = new Map(placed.map((p) => [p.issue_id, p._count._all]));

  const planned = await tenantDb(businessId).publication.groupBy({
    by: ["newspaper_id", "publication_date"],
    where: {
      newspaper_id: { in: issues.map((i) => i.newspaper_id) },
      publication_date: { in: issues.map((i) => i.issue_date) },
      status: { not: "canceled" },
    },
    _count: { _all: true },
  });
  const key = (newspaperId: string, date: Date) => `${newspaperId}|${isoDate(date)}`;
  const plannedBy = new Map(
    planned.map((p) => [key(p.newspaper_id, p.publication_date), p._count._all]),
  );

  return issues.map((issue) => ({
    ...issue,
    placedCount: placedBy.get(issue.id) ?? 0,
    plannedCount: plannedBy.get(key(issue.newspaper_id, issue.issue_date)) ?? 0,
  }));
}

const BOARD_INCLUDE = {
  newspaper: { select: { id: true, name: true } },
  pages: {
    orderBy: { page_number: "asc" as const },
    include: {
      /** The page's own snapshot of the areas that are not for sale. */
      reservations: { orderBy: { name: "asc" as const } },
      page_type: {
        select: {
          id: true,
          name: true,
          allowed_shapes: {
            include: {
              ad_shape: {
                select: {
                  id: true,
                  name: true,
                  cols: true,
                  rows: true,
                  position_mode: true,
                  allowed_cells: true,
                },
              },
            },
          },
        },
      },
    },
  },
  placements: {
    // Includes `published`: a closed issue must still show its own board.
    where: { status: { in: ON_PAGE_STATES } },
    include: {
      publication: {
        select: {
          id: true,
          customer: { select: { id: true, business_name: true } },
          // For the colour of the ad on the board (the user, 01/11/2026).
          order: { select: { status: true } },
        },
      },
      advertisement: {
        select: {
          id: true,
          name: true,
          preview_url: true,
          file_url: true,
          file_type: true,
          file_size: true,
          status: true,
          validation_status: true,
        },
      },
      // position_mode and allowed_cells come along so the board can rebuild the
      // real shape when a placement is PICKED UP — a moved strip is still
      // bottom-only, and rule 5 needs the shape's own id (see
      // CanvasPlacement.shapeId).
      ad_shape: {
        select: {
          id: true,
          name: true,
          cols: true,
          rows: true,
          position_mode: true,
          allowed_cells: true,
        },
      },
    },
  },
};

export async function getIssue(businessId: string, id: string) {
  return tenantDb(businessId).issue.findUnique({ where: { id }, include: BOARD_INCLUDE });
}

/** The page types a newspaper offers — what the board's "add page" card lists. */
export async function pageTypesOf(businessId: string, newspaperId: string) {
  return tenantDb(businessId).pageType.findMany({
    where: { newspaper_id: newspaperId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, auto_place: true },
  });
}

/** The shapes a page type accepts, in the shape the placement rules want. */
export function shapeSpecsOf(page: {
  page_type: {
    allowed_shapes: Array<{
      ad_shape: {
        id: string;
        name: string;
        cols: number;
        rows: number;
        position_mode: string;
        allowed_cells: unknown;
      };
    }>;
  };
}): ShapeSpec[] {
  return page.page_type.allowed_shapes.map(({ ad_shape }) => ({
    id: ad_shape.id,
    name: ad_shape.name,
    cols: ad_shape.cols,
    rows: ad_shape.rows,
    positions:
      ad_shape.position_mode === "region" ? readAllowedCells(ad_shape.allowed_cells) : null,
  }));
}

/** The reserved areas of a page, in the shape the placement rules want. */
export function reservedOf(page: {
  reservations: Array<{
    name: string;
    col: number;
    row: number;
    cols: number;
    rows: number;
    asset_key: string | null;
  }>;
}): ReservedArea[] {
  return page.reservations.map((r) => ({
    name: r.name,
    rect: { col: r.col, row: r.row, cols: r.cols, rows: r.rows },
    assetKey: r.asset_key,
  }));
}

/**
 * Every publication due in this issue — the right-hand panel of the board.
 *
 * Matched on (newspaper, date) rather than held by a foreign key, because a
 * publication is a commitment to a DATE and the issue for that date may not
 * exist yet when the order is approved. That is also what US-007 AC-2 asks
 * for: open the issue and the unplaced list is already full.
 */
export async function publicationsForIssue(
  businessId: string,
  newspaperId: string,
  issueDate: Date,
) {
  return tenantDb(businessId).publication.findMany({
    where: {
      newspaper_id: newspaperId,
      publication_date: issueDate,
      status: { notIn: ["canceled"] },
    },
    orderBy: [{ created_at: "asc" }],
    include: {
      customer: {
        select: { id: true, business_name: true, preferred_page: true, no_auto_place: true },
      },
      // What the board's details panel shows and edits (03/11/2026).
      order: { select: { id: true, number: true } },
      ad_shape: {
        select: {
          id: true,
          name: true,
          cols: true,
          rows: true,
          position_mode: true,
          allowed_cells: true,
        },
      },
      advertisement: {
        select: {
          id: true,
          name: true,
          customer_id: true,
          preview_url: true,
          // The files themselves, for the designer's package (03/11/2026).
          file_url: true,
          file_type: true,
          status: true,
          validation_status: true,
          content_width: true,
          content_height: true,
        },
      },
      // The page type the customer bought — the board warns when an ad goes
      // on a page of another type.
      order_item: {
        select: {
          id: true,
          requested_page: true,
          position_kind: true,
          position_flex: true,
          position_flex_unit: true,
          position_note: true,
          page_type: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/** How many publications already wait for a date — the "new issue" preview. */
export async function plannedCountFor(businessId: string, newspaperId: string, issueDate: Date) {
  return tenantDb(businessId).publication.count({
    where: {
      newspaper_id: newspaperId,
      publication_date: issueDate,
      status: { notIn: ["canceled"] },
    },
  });
}

/** Just the status — what every write path checks before touching anything. */
export async function getIssueStatus(businessId: string, id: string) {
  const issue = await tenantDb(businessId).issue.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  return issue ? { id: issue.id, status: issue.status as IssueStatus } : null;
}

/**
 * What the "next issue" offer needs: this issue's date and its newspaper's
 * printing schedule, plus whether an issue already exists for the date the
 * schedule suggests.
 */
export async function nextIssueContext(businessId: string, issueId: string) {
  const issue = await tenantDb(businessId).issue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      issue_date: true,
      newspaper: { select: { id: true, name: true, publication_days: true } },
    },
  });
  if (!issue) return null;

  return {
    issueId: issue.id,
    afterDate: isoDate(issue.issue_date),
    newspaperId: issue.newspaper.id,
    newspaperName: issue.newspaper.name,
    publicationDays: issue.newspaper.publication_days,
  };
}

/** Dates this newspaper already has an issue for — offered ones are filtered. */
export async function issueDatesTaken(
  businessId: string,
  newspaperId: string,
  dates: string[],
): Promise<string[]> {
  if (dates.length === 0) return [];
  const rows = await tenantDb(businessId).issue.findMany({
    where: { newspaper_id: newspaperId, issue_date: { in: dates.map((d) => new Date(d)) } },
    select: { issue_date: true },
  });
  return rows.map((r) => isoDate(r.issue_date));
}

/**
 * The issues that are open for placing right now — what the dashboard offers.
 *
 * `ready_for_print` is left out on purpose: it is open to an admin only, and a
 * shortcut that lands most people on a locked board is a shortcut that teaches
 * them not to trust shortcuts.
 */
export async function openIssuesForPlacement(businessId: string, take = 5) {
  const issues = await tenantDb(businessId).issue.findMany({
    // The same three states the dashboard card counts (FR-20). A widget that
    // listed two of them under a number that counted three would be read as a
    // missing issue, not as two different definitions.
    where: { status: { in: OPEN_ISSUE_STATES } },
    orderBy: [{ issue_date: "asc" }],
    include: { newspaper: { select: { name: true } } },
    take,
  });

  const placed = await tenantDb(businessId).placement.groupBy({
    by: ["issue_id"],
    where: { issue_id: { in: issues.map((i) => i.id) }, status: { in: ON_PAGE_STATES } },
    _count: { _all: true },
  });
  const placedBy = new Map(placed.map((p) => [p.issue_id, p._count._all]));

  const planned = await tenantDb(businessId).publication.groupBy({
    by: ["newspaper_id", "publication_date"],
    where: {
      newspaper_id: { in: issues.map((i) => i.newspaper_id) },
      publication_date: { in: issues.map((i) => i.issue_date) },
      status: { not: "canceled" },
    },
    _count: { _all: true },
  });
  const key = (newspaperId: string, date: Date) => `${newspaperId}|${isoDate(date)}`;
  const plannedBy = new Map(
    planned.map((p) => [key(p.newspaper_id, p.publication_date), p._count._all]),
  );

  return issues.map((issue) => ({
    id: issue.id,
    date: issue.issue_date,
    newspaperName: issue.newspaper.name,
    placedCount: placedBy.get(issue.id) ?? 0,
    plannedCount: plannedBy.get(key(issue.newspaper_id, issue.issue_date)) ?? 0,
  }));
}

/**
 * Which issue a publication would be placed in, if one exists for its date.
 *
 * A publication reaches a board by (newspaper, date) alone, so this is the same
 * lookup the board does — from the other end.
 */
export async function issuesForPublications(
  businessId: string,
  publications: ReadonlyArray<{ newspaper_id: string; publication_date: Date }>,
): Promise<Map<string, string>> {
  if (publications.length === 0) return new Map();

  const rows = await tenantDb(businessId).issue.findMany({
    where: {
      newspaper_id: { in: [...new Set(publications.map((p) => p.newspaper_id))] },
      issue_date: {
        in: [...new Set(publications.map((p) => p.publication_date.getTime()))].map(
          (t) => new Date(t),
        ),
      },
    },
    select: { id: true, newspaper_id: true, issue_date: true },
  });

  return new Map(rows.map((r) => [`${r.newspaper_id}|${isoDate(r.issue_date)}`, r.id]));
}

/** Just the newspaper an issue belongs to — for price lookups. */
export async function getIssueNewspaper(businessId: string, id: string) {
  return tenantDb(businessId).issue.findUnique({
    where: { id },
    select: { id: true, newspaper_id: true },
  });
}

export async function findIssueByDate(businessId: string, newspaperId: string, issueDate: Date) {
  return tenantDb(businessId).issue.findFirst({
    where: { newspaper_id: newspaperId, issue_date: issueDate },
    select: { id: true },
  });
}

/**
 * Every issue and what was put in it — the tracking screen (backlog item 11).
 *
 * ── What it cannot answer, and why that is written down ──────────────────────
 * The request was "who put which publication in, and what size". It answers
 * everything except WHO: there is no `placed_by_user_id` on `Placement`, and
 * adding one was asked about explicitly and declined. `AuditLog` records seven
 * actions and placing is not one of them, so there is nowhere else to look.
 *
 * What is offered instead is who uploaded the ARTWORK, which is a different
 * fact and is labelled as one. Showing a name under a heading that says "who
 * placed" would be worse than showing nothing.
 */
export async function issueReport(
  businessId: string,
  filter: { status?: "all" | "open" | "closed" } = {},
) {
  const status = filter.status ?? "all";

  const issues = await tenantDb(businessId).issue.findMany({
    where:
      status === "closed"
        ? { status: "closed" }
        : status === "open"
          ? { status: { not: "closed" } }
          : {},
    orderBy: [{ issue_date: "desc" }],
    take: 60,
    include: {
      newspaper: { select: { name: true } },
      pages: { select: { id: true, page_number: true } },
      placements: {
        where: { status: { in: ON_PAGE_STATES } },
        orderBy: [{ created_at: "asc" }],
        include: {
          publication: {
            select: {
              id: true,
              customer: { select: { id: true, business_name: true } },
            },
          },
          ad_shape: { select: { name: true } },
          advertisement: {
            select: { name: true, uploaded_by: { select: { name: true } } },
          },
        },
      },
    },
  });

  return issues.map((issue) => {
    const pageNumbers = new Map(issue.pages.map((p) => [p.id, p.page_number]));
    return {
      id: issue.id,
      date: issue.issue_date,
      status: issue.status as IssueStatus,
      closedAt: issue.closed_at,
      newspaperName: issue.newspaper.name,
      pageCount: issue.pages.length,
      grid: gridOfIssue(issue),
      placements: issue.placements.map((placement) => ({
        id: placement.id,
        customerName: placement.publication.customer.business_name,
        customerId: placement.publication.customer.id,
        shapeName: placement.ad_shape.name,
        cols: placement.cols,
        rows: placement.rows,
        pageNumber: pageNumbers.get(placement.issue_page_id) ?? 0,
        placedAt: placement.created_at,
        adName: placement.advertisement.name,
        // NOT who placed it — see the note above.
        uploadedBy: placement.advertisement.uploaded_by.name,
        duplicate: placement.duplicate_override_approved,
      })),
    };
  });
}

/* ------------------------------------------------------------------ writing */

export class DuplicateIssueError extends Error {
  constructor() {
    super("כבר קיים גיליון לעיתון הזה בתאריך הזה");
    this.name = "DuplicateIssueError";
  }
}

/**
 * Copies a page type's reserved areas onto pages that were just created.
 *
 * The snapshot half of backlog item 14, and the same reasoning as the grid
 * snapshot above it (conventions.md §7 rule 2): moving the masthead on the page
 * type changes every issue opened from that moment on, and none of the ones
 * already laid out. Without this, an ad placed legally six weeks ago could find
 * itself underneath a reserved area that did not exist when it was sold.
 */
async function copyReservations(
  tx: Prisma.TransactionClient,
  issueId: string,
  pages: Array<{ id: string; page_type_id: string }>,
) {
  const typeIds = [...new Set(pages.map((p) => p.page_type_id))];
  if (typeIds.length === 0) return;

  const areas = await tx.pageReservation.findMany({ where: { page_type_id: { in: typeIds } } });
  if (areas.length === 0) return;

  await tx.issuePageReservation.createMany({
    data: pages.flatMap((page) =>
      areas
        .filter((area) => area.page_type_id === page.page_type_id)
        .map((area) => ({
          issue_id: issueId,
          issue_page_id: page.id,
          name: area.name,
          col: area.col,
          row: area.row,
          cols: area.cols,
          rows: area.rows,
          asset_key: area.asset_key,
        })),
    ),
  });
}

export type NewIssueInput = {
  newspaperId: string;
  /** yyyy-mm-dd. */
  date: string;
  /** Page types in printing order; index + 1 becomes page_number. */
  pageTypeIds: string[];
};

/**
 * Opens an issue: one transaction that snapshots the grid and builds the pages.
 *
 * Nothing about the publications is copied — they are found by date every time
 * the board loads. Copying them would freeze a list that is still legitimately
 * changing right up until the issue is closed.
 */
export async function createIssue(businessId: string, input: NewIssueInput) {
  const paper = await tenantDb(businessId).newspaper.findUnique({
    where: { id: input.newspaperId },
  });
  if (!paper) throw new Error("העיתון לא נמצא");

  const date = new Date(input.date);

  return basePrisma
    .$transaction(async (tx) => {
      const issue = await tx.issue.create({
        data: {
          business_id: businessId,
          newspaper_id: paper.id,
          issue_date: date,
          status: "draft",
          // The snapshot (conventions.md §7 rule 2).
          page_size: paper.page_size,
          custom_width_mm: paper.custom_width_mm,
          custom_height_mm: paper.custom_height_mm,
          margin: paper.margin,
          columns: paper.columns,
          row_height_mm: paper.row_height_mm,
          gutter_mm: paper.gutter_mm,
        },
      });

      const pages = await tx.issuePage.createManyAndReturn({
        data: input.pageTypeIds.map((pageTypeId, index) => ({
          issue_id: issue.id,
          page_type_id: pageTypeId,
          page_number: index + 1,
        })),
        select: { id: true, page_type_id: true },
      });
      await copyReservations(tx, issue.id, pages);

      return issue;
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new DuplicateIssueError();
      }
      throw error;
    });
}

/**
 * Renumbering has to pass through numbers that already exist.
 *
 * `@@unique([issue_id, page_number])` is checked per row and is not deferrable,
 * so "shift everything after page 3 up by one" fails the moment it tries to
 * make a second page 4. Parking the affected rows above every real number
 * first, then bringing them down, keeps every intermediate state legal.
 *
 * The offset is larger than any issue anyone will print, and it lives inside
 * one transaction, so nothing ever observes the parked numbers.
 */
const RENUMBER_OFFSET = 10_000;

/** Appends a page. The number is the next one free, never a gap-filler. */
export async function addIssuePage(businessId: string, issueId: string, pageTypeId: string) {
  const last = await tenantDb(businessId).issuePage.findFirst({
    where: { issue_id: issueId },
    orderBy: { page_number: "desc" },
    select: { page_number: true },
  });
  const page = await tenantDb(businessId).issuePage.create({
    data: {
      issue_id: issueId,
      page_type_id: pageTypeId,
      page_number: (last?.page_number ?? 0) + 1,
    },
  });
  await copyReservations(basePrisma, issueId, [page]);
  return page;
}

/**
 * Inserts a SHEET directly after a given page — the "+" on the seam.
 *
 * Four pages, not one and not two: a saddle-stitched sheet is folded once and
 * carries four pages, so any other number produces an issue that cannot be
 * folded and stapled (PAGES_PER_SHEET). Appending and then dragging into place
 * is also two actions for one intention, and on a 24-page issue the drag is the
 * expensive half — naming the seam says where in one click.
 */
export async function insertIssuePages(
  businessId: string,
  issueId: string,
  pageTypeId: string,
  afterPageId: string,
  count = PAGES_PER_SHEET,
) {
  const after = await tenantDb(businessId).issuePage.findFirst({
    where: { id: afterPageId, issue_id: issueId },
    select: { page_number: true },
  });
  if (!after) throw new Error("העמוד שאחריו להוסיף לא נמצא");

  const added = Math.max(1, Math.trunc(count));

  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "IssuePage"
         SET "page_number" = "page_number" + ${RENUMBER_OFFSET}
       WHERE "issue_id" = ${issueId}
         AND "page_number" > ${after.page_number}`;

    const pages = await tx.issuePage.createManyAndReturn({
      data: Array.from({ length: added }, (_, i) => ({
        issue_id: issueId,
        page_type_id: pageTypeId,
        page_number: after.page_number + 1 + i,
      })),
      select: { id: true, page_type_id: true },
    });
    await copyReservations(tx, issueId, pages);

    await tx.$executeRaw`
      UPDATE "IssuePage"
         SET "page_number" = "page_number" - ${RENUMBER_OFFSET - added}
       WHERE "issue_id" = ${issueId}
         AND "page_number" > ${RENUMBER_OFFSET}`;

    return added;
  });
}

/**
 * Puts the pages in the order the strip was dragged into.
 *
 * Takes the WHOLE order rather than "move page X to position N": a partial
 * instruction has to be reconciled against whatever the server currently holds,
 * and two designers dragging at once would then produce an order neither of
 * them arranged. A full list is idempotent — replaying it lands in the same
 * place — and ids the issue does not own are ignored rather than trusted.
 */
export async function reorderIssuePages(
  businessId: string,
  issueId: string,
  orderedPageIds: string[],
) {
  const pages = await tenantDb(businessId).issuePage.findMany({
    where: { issue_id: issueId },
    select: { id: true, page_number: true },
  });
  const known = new Set(pages.map((p) => p.id));

  // The submitted order first, then anything it left out, so a stale tab that
  // does not know about a page added a moment ago cannot delete it from the
  // running order.
  const ordered = [
    ...orderedPageIds.filter((id) => known.has(id)),
    ...pages
      .filter((p) => !orderedPageIds.includes(p.id))
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => p.id),
  ];
  const final = [...new Set(ordered)];
  if (final.length !== pages.length) throw new Error("סדר העמודים לא תקין");

  await basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "IssuePage"
         SET "page_number" = "page_number" + ${RENUMBER_OFFSET}
       WHERE "issue_id" = ${issueId}`;

    for (const [index, id] of final.entries()) {
      await tx.issuePage.update({ where: { id }, data: { page_number: index + 1 } });
    }
  });

  return final;
}

export class PageNotEmptyError extends Error {
  constructor(pageNumbers: number[] = []) {
    super(
      pageNumbers.length > 1
        ? `יש שיבוצים בעמודים ${pageNumbers[0]}–${pageNumbers[pageNumbers.length - 1]}. צריך להוריד אותם לפני שמסירים את הדף.`
        : "יש שיבוצים בעמוד הזה. צריך להוריד אותם לפני שמסירים אותו.",
    );
    this.name = "PageNotEmptyError";
  }
}

/**
 * Removes a sheet's worth of pages, starting at the one named, and closes the
 * numbering behind them (08/11/2026 — it removed ONE page, and an 8-page issue
 * became 7, which cannot be folded). Which pages go is `sheetToRemove`.
 *
 * Refuses while anything is placed on any of them: cascading the delete would
 * silently take live placements — and the publications they belong to — with
 * it, which is a data loss disguised as a layout tweak.
 */
export async function removeIssuePage(businessId: string, issueId: string, pageId: string) {
  const pages = await tenantDb(businessId).issuePage.findMany({
    where: { issue_id: issueId },
    orderBy: { page_number: "asc" },
    select: { id: true, page_number: true },
  });
  const chosen = pages.find((p) => p.id === pageId);
  if (!chosen) return 0;
  const plan = sheetToRemove(pages.length, chosen.page_number);
  if (!plan.ok) throw new PageRemovalRefused(plan.message);
  const going = pages.filter((p) => plan.pageNumbers.includes(p.page_number));
  const ids = going.map((p) => p.id);

  const placed = await tenantDb(businessId).placement.count({
    where: { issue_page_id: { in: ids }, status: { in: ON_PAGE_STATES } },
  });
  if (placed > 0) throw new PageNotEmptyError(plan.pageNumbers);

  const last = plan.pageNumbers[plan.pageNumbers.length - 1]!;
  await basePrisma.$transaction(async (tx) => {
    await tx.issuePage.deleteMany({ where: { id: { in: ids }, issue_id: issueId } });
    // Park, then bring down: the unique index on (issue_id, page_number) is
    // checked per row, and one UPDATE has no order (RENUMBER_OFFSET).
    await tx.$executeRaw`
      UPDATE "IssuePage"
         SET "page_number" = "page_number" + ${RENUMBER_OFFSET}
       WHERE "issue_id" = ${issueId}
         AND "page_number" > ${last}`;
    await tx.$executeRaw`
      UPDATE "IssuePage"
         SET "page_number" = "page_number" - ${RENUMBER_OFFSET + ids.length}
       WHERE "issue_id" = ${issueId}
         AND "page_number" > ${RENUMBER_OFFSET}`;
  });
  return ids.length;
}

/** The removal would break the fold or take the cover — said in words. */
export class PageRemovalRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageRemovalRefused";
  }
}

export class IssueDateTakenError extends Error {
  constructor() {
    super("כבר קיים גיליון לעיתון הזה בתאריך שנבחר");
    this.name = "IssueDateTakenError";
  }
}

/**
 * Moves an issue to another date — and takes its publications with it.
 *
 * ── Why the publications move ────────────────────────────────────────────────
 * A publication reaches a board by (newspaper, date) alone, so moving only the
 * issue would swap everything on it for whatever else was sold for the new
 * date, and strand the ads that were already laid out. That is not what
 * happens when a paper is pushed from Tuesday to Wednesday for a chag: the ads
 * are pushed with it. The placements survive, because they belong to the pages,
 * and the pages have not moved.
 *
 * ── What this really is ──────────────────────────────────────────────────────
 * Changing `publication_date` on APPROVED orders — the date a customer bought.
 * It is legitimate (the press did not run) and it is not a field edit, which is
 * why it takes the audit path and why the screen has to name what moves before
 * it runs.
 *
 * The order LINES move too. Leaving them behind would make the order screen
 * quote a date the publication no longer has, and nobody would know which of
 * the two the customer was told.
 */
export async function moveIssueDate(
  ctx: { businessId: string; userId: string },
  issueId: string,
  newDate: string,
) {
  const issue = await tenantDb(ctx.businessId).issue.findUnique({
    where: { id: issueId },
    select: { id: true, newspaper_id: true, issue_date: true, status: true },
  });
  if (!issue) throw new Error("הגיליון לא נמצא");

  const target = new Date(newDate);
  const from = isoDate(issue.issue_date);
  if (isoDate(target) === from) return { moved: 0, from, to: from };

  const clash = await tenantDb(ctx.businessId).issue.findFirst({
    where: { newspaper_id: issue.newspaper_id, issue_date: target, id: { not: issueId } },
    select: { id: true },
  });
  if (clash) throw new IssueDateTakenError();

  const result = await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "close_issue", targetType: "Issue", targetId: issueId },
    async (tx) => {
      const publications = await tx.publication.findMany({
        where: {
          business_id: ctx.businessId,
          newspaper_id: issue.newspaper_id,
          publication_date: issue.issue_date,
          status: { notIn: ["canceled"] },
        },
        select: { id: true, order_item_id: true },
      });

      await tx.issue.update({ where: { id: issueId }, data: { issue_date: target } });

      if (publications.length > 0) {
        await tx.publication.updateMany({
          where: { id: { in: publications.map((p) => p.id) } },
          data: { publication_date: target },
        });

        const itemIds = publications
          .map((p) => p.order_item_id)
          .filter((id): id is string => id !== null);
        if (itemIds.length > 0) {
          await tx.adOrderItem.updateMany({
            where: { id: { in: itemIds } },
            data: { publication_date: target },
          });
        }
      }

      return {
        old: { issue_date: from },
        new: {
          issue_date: isoDate(target),
          moved_publications: publications.length,
          reason: "issue_date_changed",
        },
        result: { moved: publications.length, from, to: isoDate(target) },
      };
    },
  );

  if (!result) throw new Error("לא הצלחנו להזיז את הגיליון");
  return result;
}

/**
 * Moves the issue along its state machine.
 *
 * Two of the moves are audited under `close_issue` (FR-6, FR-10): closing the
 * issue, and an admin walking it back out of any state. Both are decisions
 * about a layout someone else may already be treating as final, and the delta
 * on the audit row is what tells the two apart. The ordinary steps between
 * `draft`, `in_layout` and `ready_for_print` are just work, and logging them
 * would bury the two rows that matter.
 */
export async function setIssueStatus(
  ctx: { businessId: string; userId: string; isAdmin: boolean },
  issueId: string,
  to: IssueStatus,
) {
  const issue = await tenantDb(ctx.businessId).issue.findUnique({
    where: { id: issueId },
    select: { id: true, status: true },
  });
  if (!issue) throw new Error("הגיליון לא נמצא");

  const from = issue.status as IssueStatus;
  const next = transition(from, to, ctx.isAdmin);

  if (next !== "closed" && !isBackward(from, next)) {
    await tenantDb(ctx.businessId).issue.update({
      where: { id: issueId },
      data: { status: next },
    });
    return next;
  }

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "close_issue", targetType: "Issue", targetId: issueId },
    async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        // Reopening clears closed_at: a date that outlives the state it
        // recorded is the kind of field a report later quotes as fact.
        data: { status: next, closed_at: next === "closed" ? new Date() : null },
      });
      return { old: { status: from }, new: { status: next } };
    },
  );
  return next;
}

/**
 * How full each page of one issue is — the dashboard's small page map
 * (redesign, 29/09/2026).
 *
 * The same `pageFill` the placement board meters every page with, fed the same
 * snapshot, placements and reserved areas: a map on the dashboard that
 * disagreed with the board it opens would be read as one of them being wrong.
 * `null` when the issue's grid cannot be resolved — the board says so in
 * words, and the dashboard simply shows no map.
 */
export async function issuePageMap(businessId: string, issueId: string) {
  const issue = await getIssue(businessId, issueId);
  if (!issue) return null;
  const grid = gridOfIssue(issue);
  if (!grid) return null;
  return issue.pages.map((page) => {
    const fill = pageFill(
      { id: page.id, number: page.page_number, pageTypeName: page.page_type.name },
      issue.placements
        .filter((p) => p.issue_page_id === page.id)
        .map((p) => ({ col: p.col, row: p.row, cols: p.cols, rows: p.rows })),
      grid,
      shapeSpecsOf(page),
      reservedOf(page).map((area) => area.rect),
    );
    return { number: page.page_number, percent: fill.percent, full: fill.full };
  });
}

/**
 * Opens every issue that should exist by now (the user, 12/10/2026): the next
 * one as soon as the previous closes, or a week before its date — whichever is
 * first. The rule is `autoOpenDates`; this only gathers its inputs.
 *
 * There is no cron (see reminders/actions.ts), so this runs when someone opens
 * the issues list, the dashboard or a board, and right after an issue closes.
 * Cheap when there is nothing to do: one query per kind, not per newspaper.
 *
 * Composition is copied from the newspaper's latest issue, exactly as "open
 * the next issue" does by hand; a newspaper with no issue yet starts from the
 * default cover / inner / back.
 */
export async function ensureUpcomingIssues(
  businessId: string,
  /**
   * The person whose page load set this off. There is no cron, so somebody's
   * request always is the trigger, and the log names them: "who opened this
   * issue?" had no answer at all (UX review, 29/10/2026).
   */
  actorUserId: string,
  now = new Date(),
) {
  const db = tenantDb(businessId);
  const today = jerusalemDay(now);
  const todayIso = isoDay(today);
  const weekEnd = addDays(today, AUTO_OPEN_DAYS);

  const [papers, closed, existing, sold] = await Promise.all([
    db.newspaper.findMany({
      select: {
        id: true,
        name: true,
        publication_days: true,
        page_types: { orderBy: { created_at: "asc" }, select: { id: true, name: true } },
      },
    }),
    // Closed issues from a week back on: the successor of anything older is
    // in the past, and the past is not backfilled.
    db.issue.findMany({
      where: { status: "closed", issue_date: { gte: addDays(today, -AUTO_OPEN_DAYS) } },
      select: { newspaper_id: true, issue_date: true },
    }),
    db.issue.findMany({
      where: { issue_date: { gte: today } },
      select: { newspaper_id: true, issue_date: true },
    }),
    db.publication.groupBy({
      by: ["newspaper_id", "publication_date"],
      where: { publication_date: { gte: today, lte: weekEnd }, status: { not: "canceled" } },
    }),
  ]);

  const opened: Array<{
    issueId: string;
    newspaperId: string;
    newspaperName: string;
    date: string;
  }> = [];
  for (const paper of papers) {
    if (paper.page_types.length === 0) continue;
    const dates = autoOpenDates({
      today: todayIso,
      publicationDays: paper.publication_days,
      closedDates: closed
        .filter((c) => c.newspaper_id === paper.id)
        .map((c) => isoDay(c.issue_date)),
      soldDates: sold
        .filter((s) => s.newspaper_id === paper.id)
        .map((s) => isoDay(s.publication_date)),
      existingDates: existing
        .filter((e) => e.newspaper_id === paper.id)
        .map((e) => isoDay(e.issue_date)),
    });
    if (dates.length === 0) continue;

    const latest = await db.issue.findFirst({
      where: { newspaper_id: paper.id },
      orderBy: { issue_date: "desc" },
      select: { pages: { orderBy: { page_number: "asc" }, select: { page_type_id: true } } },
    });
    const pageTypeIds = latest?.pages.length
      ? latest.pages.map((p) => p.page_type_id)
      : defaultPageTypeIds(paper.page_types);

    for (const date of dates) {
      try {
        const issue = await createIssue(businessId, { newspaperId: paper.id, date, pageTypeIds });
        await basePrisma.auditLog.create({
          data: {
            business_id: businessId,
            user_id: actorUserId,
            action: "auto_open_issue",
            target_type: "Issue",
            target_id: issue.id,
            new_value: { newspaper: paper.name, date, pages: pageTypeIds.length },
          },
        });
        opened.push({ issueId: issue.id, newspaperId: paper.id, newspaperName: paper.name, date });
      } catch (error) {
        // Two tabs opening the same list at once: the other one won. Fine.
        if (!(error instanceof DuplicateIssueError)) throw error;
      }
    }
  }
  return opened;
}

/** The first issue of the same newspaper after this one — what closing leads to. */
export async function nextIssueAfter(businessId: string, issueId: string) {
  const db = tenantDb(businessId);
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { newspaper_id: true, issue_date: true },
  });
  if (!issue) return null;
  const next = await db.issue.findFirst({
    where: { newspaper_id: issue.newspaper_id, issue_date: { gt: issue.issue_date } },
    orderBy: { issue_date: "asc" },
    select: { id: true, issue_date: true },
  });
  return next ? { id: next.id, date: isoDate(next.issue_date) } : null;
}

/* ------------------------------------------- reserved areas into open issues */

export type ReservationSync = {
  /** Open issues whose pages now carry the newspaper's current areas. */
  issues: number;
  /** Areas left off a page because an ad already sits there, or it no longer fits. */
  skipped: Array<{ date: string; page: number; name: string }>;
};

/**
 * Brings the reserved areas of one page type into every issue that is still
 * open.
 *
 * Issues copy the areas when a page is created (`copyReservations`), and that
 * snapshot is right for what a page IS — but a logo uploaded to the cover's
 * reserved area three minutes after the week's issue opened never reached it,
 * and the issue printed without the logo with nothing on screen to say why
 * (the user, 31/10/2026). Closed issues are left alone: they are printed.
 *
 * An area is not forced onto a page where an ad already sits, or where the
 * issue's own grid snapshot has no room for it; those come back in `skipped`
 * so the settings screen can say which page lost out.
 */
export async function syncReservationsToOpenIssues(
  businessId: string,
  pageTypeId: string,
): Promise<ReservationSync> {
  const db = tenantDb(businessId);
  const areas = await db.pageReservation.findMany({ where: { page_type_id: pageTypeId } });
  const issues = await db.issue.findMany({
    where: { status: { not: "closed" }, pages: { some: { page_type_id: pageTypeId } } },
    include: {
      pages: { where: { page_type_id: pageTypeId }, select: { id: true, page_number: true } },
      placements: {
        where: { status: { in: ON_PAGE_STATES } },
        select: { issue_page_id: true, col: true, row: true, cols: true, rows: true },
      },
    },
  });

  const skipped: ReservationSync["skipped"] = [];
  for (const issue of issues) {
    const grid = gridOfIssue(issue);
    const date = isoDay(issue.issue_date);
    await basePrisma.$transaction(async (tx) => {
      const pageIds = issue.pages.map((p) => p.id);
      await tx.issuePageReservation.deleteMany({
        where: { issue_id: issue.id, issue_page_id: { in: pageIds } },
      });
      const rows = issue.pages.flatMap((page) =>
        areas.flatMap((area) => {
          const fits =
            grid !== null &&
            area.col + area.cols <= grid.columns &&
            area.row + area.rows <= grid.rows;
          const covered = issue.placements.some(
            (p) => p.issue_page_id === page.id && overlaps(p, area),
          );
          if (!fits || covered) {
            skipped.push({ date, page: page.page_number, name: area.name });
            return [];
          }
          return [
            {
              issue_id: issue.id,
              issue_page_id: page.id,
              name: area.name,
              col: area.col,
              row: area.row,
              cols: area.cols,
              rows: area.rows,
              asset_key: area.asset_key,
            },
          ];
        }),
      );
      if (rows.length > 0) await tx.issuePageReservation.createMany({ data: rows });
    });
  }
  return { issues: issues.length, skipped };
}

/* ------------------------------------------------------- published archive */

export type PublishedFilters = {
  /** yyyy-mm-dd, inclusive. Empty = no bound. */
  from: string;
  to: string;
  newspaperId: string;
  /** Part of an advertiser's name — issues that carried one of their ads. */
  customer: string;
};

/**
 * Closed issues, the archive (the user, 31/10/2026): they left the working
 * list, where they only pushed the issues still being laid out further down,
 * and are found here by date, newspaper or an advertiser who appeared in them.
 */
export async function publishedIssues(
  businessId: string,
  filters: PublishedFilters,
  page: { skip: number; take: number },
) {
  const where: Prisma.IssueWhereInput = {
    status: "closed",
    ...(filters.from || filters.to
      ? {
          issue_date: {
            ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00Z`) } : {}),
            ...(filters.to ? { lte: new Date(`${filters.to}T00:00:00Z`) } : {}),
          },
        }
      : {}),
    ...(filters.newspaperId ? { newspaper_id: filters.newspaperId } : {}),
    ...(filters.customer
      ? {
          placements: {
            some: {
              status: { in: ON_PAGE_STATES },
              publication: {
                customer: { business_name: { contains: filters.customer, mode: "insensitive" } },
              },
            },
          },
        }
      : {}),
  };
  const db = tenantDb(businessId);
  const [rows, total] = await Promise.all([
    db.issue.findMany({
      where,
      orderBy: { issue_date: "desc" },
      skip: page.skip,
      take: page.take,
      select: {
        id: true,
        issue_date: true,
        closed_at: true,
        final_pdf_url: true,
        press_pdf_url: true,
        newspaper: { select: { name: true } },
        _count: {
          select: { pages: true, placements: { where: { status: { in: ON_PAGE_STATES } } } },
        },
      },
    }),
    db.issue.count({ where }),
  ]);
  return { rows, total };
}
