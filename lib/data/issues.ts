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
import type { ShapeSpec } from "@/lib/domain/placement";
import { isBackward, transition, type IssueStatus } from "@/lib/domain/issue-status";
import { PAGES_PER_SHEET } from "@/lib/domain/issue-layout";
import { withAudit } from "./audit";

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

export async function listIssues(businessId: string) {
  const issues = await tenantDb(businessId).issue.findMany({
    orderBy: [{ issue_date: "desc" }],
    include: {
      newspaper: { select: { id: true, name: true } },
      _count: { select: { pages: true } },
    },
    take: 100,
  });

  // "X of Y placed" per card, in two grouped queries rather than two per card.
  // A count per issue is the shape that quietly turns a list of forty into
  // eighty round trips, and it does not announce itself — the page merely gets
  // slower as the publisher works through the year.
  const ids = issues.map((i) => i.id);

  const placed = await tenantDb(businessId).placement.groupBy({
    by: ["issue_id"],
    where: { issue_id: { in: ids }, status: "placed" },
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
    where: { status: "placed" as const },
    include: {
      publication: {
        select: {
          id: true,
          customer: { select: { id: true, contact_name: true, business_name: true } },
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
        },
      },
      ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
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
    select: { id: true, name: true },
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
      status: { notIn: ["canceled", "billed"] },
    },
    orderBy: [{ created_at: "asc" }],
    include: {
      customer: { select: { id: true, contact_name: true, business_name: true } },
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
          status: true,
          validation_status: true,
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
      status: { notIn: ["canceled", "billed"] },
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
    where: { status: { in: ["draft", "in_layout"] } },
    orderBy: [{ issue_date: "asc" }],
    include: { newspaper: { select: { name: true } } },
    take,
  });

  const placed = await tenantDb(businessId).placement.groupBy({
    by: ["issue_id"],
    where: { issue_id: { in: issues.map((i) => i.id) }, status: "placed" },
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

/* ------------------------------------------------------------------ writing */

export class DuplicateIssueError extends Error {
  constructor() {
    super("כבר קיים גיליון לעיתון הזה בתאריך הזה");
    this.name = "DuplicateIssueError";
  }
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

      await tx.issuePage.createMany({
        data: input.pageTypeIds.map((pageTypeId, index) => ({
          issue_id: issue.id,
          page_type_id: pageTypeId,
          page_number: index + 1,
        })),
      });

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
  return tenantDb(businessId).issuePage.create({
    data: {
      issue_id: issueId,
      page_type_id: pageTypeId,
      page_number: (last?.page_number ?? 0) + 1,
    },
  });
}

/**
 * Inserts a SHEET directly after a given page — the "+" on the seam.
 *
 * Two pages, not one: inner pages do not exist singly. A sheet folded into the
 * issue carries two inner sides, and adding one of them is not something a
 * printer can do. Appending and then dragging into place is also two actions
 * for one intention, and on a 24-page issue the drag is the expensive half —
 * naming the seam says where in one click.
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

    await tx.issuePage.createMany({
      data: Array.from({ length: added }, (_, i) => ({
        issue_id: issueId,
        page_type_id: pageTypeId,
        page_number: after.page_number + 1 + i,
      })),
    });

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
  constructor() {
    super("אי אפשר להסיר עמוד שיש עליו שיבוצים — הסירי אותם קודם");
    this.name = "PageNotEmptyError";
  }
}

/**
 * Removes a page and closes the numbering behind it.
 *
 * Refuses while anything is placed on it: cascading the delete would silently
 * take live placements — and the publications they belong to — with it, which
 * is a data loss disguised as a layout tweak.
 */
export async function removeIssuePage(businessId: string, issueId: string, pageId: string) {
  const placed = await tenantDb(businessId).placement.count({
    where: { issue_page_id: pageId, status: "placed" },
  });
  if (placed > 0) throw new PageNotEmptyError();

  await basePrisma.$transaction(async (tx) => {
    const page = await tx.issuePage.findFirst({
      where: { id: pageId, issue: { id: issueId, business_id: businessId } },
    });
    if (!page) return;

    await tx.issuePage.delete({ where: { id: page.id } });
    // Renumber what follows, one statement, in ascending order so the unique
    // index on (issue_id, page_number) is never transiently violated.
    await tx.$executeRaw`
      UPDATE "IssuePage"
         SET "page_number" = "page_number" - 1
       WHERE "issue_id" = ${issueId}
         AND "page_number" > ${page.page_number}`;
  });
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
          status: { notIn: ["canceled", "billed"] },
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
