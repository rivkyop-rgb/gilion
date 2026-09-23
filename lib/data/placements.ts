/**
 * Placing, removing and moving ads on an issue page (US-007, FR-5, FR-16).
 *
 * Two layers of defence, on purpose:
 *
 *  - `lib/domain/placement.ts` decides, in pure code, whether a placement is
 *    legal and produces the Hebrew sentence saying why it is not.
 *  - The DATABASE decides who wins when two designers try the same space at the
 *    same moment. `placement_no_overlap` and `placement_publication_unique` are
 *    the only checks that survive a race, and they surface as two DIFFERENT
 *    error codes — `23P01` from Postgres for the exclusion constraint, `P2002`
 *    from Prisma for the unique index. Prisma does not map the first onto the
 *    second, so both are translated here (conventions.md §4).
 *
 * The domain check is not redundant: a constraint violation cannot say WHICH
 * rectangle is in the way, and the board needs to highlight it.
 */
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import { gridOfIssue, insertIssuePages, isoDate, reservedOf, shapeSpecsOf } from "./issues";
import { readAllowedCells } from "./ad-shapes";
import { withAudit } from "./audit";
import { checkPlacement, type PlacementRejection, type ShapeSpec } from "@/lib/domain/placement";
import {
  autoPlace,
  sheetsNeededFor,
  type AutoPlaceItem,
  type AutoPlacePage,
} from "@/lib/domain/auto-place";
import { requireEditable, type IssueStatus } from "@/lib/domain/issue-status";
import { transition, type PublicationStatus } from "@/lib/domain/publication-status";
import type { GridRect } from "@/lib/domain/slot-geometry";

export class PlacementRejected extends Error {
  constructor(readonly rejection: PlacementRejection) {
    super(rejection.message);
    this.name = "PlacementRejected";
  }
}

export type PlaceInput = {
  issueId: string;
  pageId: string;
  publicationId: string;
  col: number;
  row: number;
};

export type ActorContext = {
  businessId: string;
  userId: string;
  isAdmin: boolean;
};

/** Postgres' SQLSTATE for an EXCLUDE violation. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Recognises the exclusion constraint firing, in every shape it arrives in.
 *
 * Prisma has no error code of its own for `EXCLUDE`. What comes back is
 * `P2039` — its catch-all for a database error it does not model — with the
 * real SQLSTATE only in the message text:
 *
 *   Database error. Code: `23P01`. Message: `conflicting key value violates
 *   exclusion constraint "placement_no_overlap"`
 *
 * So the check reads the driver code, the `meta` bag and the message, and the
 * constraint name is included as the last resort: a future Prisma that models
 * this properly will change the wrapper, and it will not rename the constraint.
 * Missing this is not cosmetic — an unrecognised exclusion violation is a 500
 * where a lost race should be a sentence in Hebrew.
 */
export function isExclusionViolation(error: unknown): boolean {
  const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (e?.code === EXCLUSION_VIOLATION) return true;
  if (e?.meta?.code === EXCLUSION_VIOLATION) return true;
  return (
    typeof e?.message === "string" &&
    (e.message.includes(EXCLUSION_VIOLATION) || e.message.includes("placement_no_overlap"))
  );
}

/**
 * Everything the rules need about one attempted placement, read in one go.
 *
 * Assembled here rather than passed in piecemeal so that the Server Action
 * cannot accidentally hand the domain layer a shape from the live catalogue
 * instead of the one this publication was sold (conventions.md §7).
 */
async function loadContext(ctx: ActorContext, input: PlaceInput, excludePlacementId?: string) {
  const db = tenantDb(ctx.businessId);

  const issue = await db.issue.findUnique({
    where: { id: input.issueId },
    include: {
      pages: {
        where: { id: input.pageId },
        include: {
          reservations: { orderBy: { name: "asc" } },
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
    },
  });
  if (!issue) throw new Error("הגיליון לא נמצא");

  const page = issue.pages[0];
  if (!page) throw new Error("העמוד לא נמצא בגיליון הזה");

  const grid = gridOfIssue(issue);
  if (!grid) throw new Error("לגיליון אין גריד תקין");

  const publication = await db.publication.findUnique({
    where: { id: input.publicationId },
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
      advertisement: {
        select: { id: true, customer_id: true, status: true, validation_status: true },
      },
    },
  });
  if (!publication) throw new Error("הפרסום לא נמצא");

  const shape: ShapeSpec = {
    id: publication.ad_shape.id,
    name: publication.ad_shape.name,
    cols: publication.ad_shape.cols,
    rows: publication.ad_shape.rows,
    positions:
      publication.ad_shape.position_mode === "region"
        ? readAllowedCells(publication.ad_shape.allowed_cells)
        : null,
  };

  const siblings = await db.placement.findMany({
    where: {
      issue_page_id: page.id,
      status: "placed",
      ...(excludePlacementId ? { id: { not: excludePlacementId } } : {}),
    },
    select: { col: true, row: true, cols: true, rows: true },
  });

  const duplicates = await db.placement.count({
    where: {
      issue_id: issue.id,
      publication_id: publication.id,
      status: "placed",
      ...(excludePlacementId ? { id: { not: excludePlacementId } } : {}),
    },
  });

  const rect: GridRect = { col: input.col, row: input.row, cols: shape.cols, rows: shape.rows };

  return {
    issue,
    page,
    publication,
    shape,
    grid,
    rect,
    siblings: siblings as GridRect[],
    alreadyInIssue: duplicates > 0,
  };
}

/**
 * Is there an UNSPENT duplicate override for this publication in this issue?
 *
 * The partial unique index admits exactly one placed row with the flag still
 * `false`, so with N placed rows of which K are flagged, one more is legal
 * precisely when K >= N. Each approval flags one more row and therefore buys
 * exactly one more placement — an override is a decision about a specific
 * duplicate, not a permanent exemption for the pair.
 */
async function overrideApproved(businessId: string, issueId: string, publicationId: string) {
  const db = tenantDb(businessId);
  const where = { issue_id: issueId, publication_id: publicationId, status: "placed" as const };
  const [placed, flagged] = await Promise.all([
    db.placement.count({ where }),
    db.placement.count({ where: { ...where, duplicate_override_approved: true } }),
  ]);
  return flagged >= placed;
}

type LoadedContext = Awaited<ReturnType<typeof loadContext>>;

/**
 * The rules, applied to a context that has already been read.
 *
 * Takes the loaded context rather than reading its own, so that placing does
 * not query the same six rows twice — and, more importantly, so the rules and
 * the write see exactly the same snapshot of the page.
 */
async function checkLoaded(
  ctx: ActorContext,
  loaded: LoadedContext,
): Promise<PlacementRejection | null> {
  return checkPlacement({
    issue: {
      status: loaded.issue.status as IssueStatus,
      newspaperId: loaded.issue.newspaper_id,
      issueDate: isoDate(loaded.issue.issue_date),
    },
    isAdmin: ctx.isAdmin,
    page: { allowedShapes: shapeSpecsOf(loaded.page), reserved: reservedOf(loaded.page) },
    publication: {
      newspaperId: loaded.publication.newspaper_id,
      publicationDate: isoDate(loaded.publication.publication_date),
      customerId: loaded.publication.customer_id,
      shapeId: loaded.publication.ad_shape_id,
    },
    advertisement: loaded.publication.advertisement
      ? {
          customerId: loaded.publication.advertisement.customer_id,
          validationPassed: loaded.publication.advertisement.validation_status === "passed",
          archived: loaded.publication.advertisement.status === "archived",
        }
      : null,
    shape: loaded.shape,
    rect: loaded.rect,
    grid: loaded.grid,
    siblings: loaded.siblings,
    alreadyInIssue: loaded.alreadyInIssue,
    duplicateOverrideApproved: await overrideApproved(
      ctx.businessId,
      loaded.issue.id,
      loaded.publication.id,
    ),
  });
}

/**
 * Places an ad. Steps 1-10 of stage 06, in order.
 *
 * The publication's status and `placement_status` move in the SAME transaction
 * as the placement row (conventions.md §3): a publication that says "placed"
 * while its placement rolled back is a lie the board then renders.
 */
export async function placeAd(ctx: ActorContext, input: PlaceInput) {
  const loaded = await loadContext(ctx, input);
  const rejection = await checkLoaded(ctx, loaded);
  if (rejection) throw new PlacementRejected(rejection);

  const advertisementId = loaded.publication.advertisement_id;
  if (!advertisementId) throw new Error("לפרסום הזה עדיין אין מודעה");

  try {
    return await basePrisma.$transaction(async (tx) => {
      const placement = await tx.placement.create({
        data: {
          issue_id: loaded.issue.id,
          issue_page_id: loaded.page.id,
          publication_id: loaded.publication.id,
          advertisement_id: advertisementId,
          ad_shape_id: loaded.shape.id,
          col: loaded.rect.col,
          row: loaded.rect.row,
          // Copied from the shape now, and read from here at print time — so a
          // later edit to the catalogue cannot resize a laid-out ad (§7).
          cols: loaded.rect.cols,
          rows: loaded.rect.rows,
          status: "placed",
          // Always false: the flag marks a row whose duplicate was FORGIVEN,
          // and the new row is the one the index is meant to still be watching.
          duplicate_override_approved: false,
        },
      });

      // An approved duplicate is a SECOND placement of a publication that is
      // already `placed`, and PLACED is not a legal event from there — nor
      // should it be: the publication's status describes the publication, not
      // the number of rectangles carrying it. Only the first placement moves it.
      const current = loaded.publication.status as PublicationStatus;
      await tx.publication.update({
        where: { id: loaded.publication.id },
        data: {
          status: current === "placed" ? current : transition(current, "PLACED"),
          placement_status: "placed",
        },
      });

      // A draft issue that has something on it is being laid out.
      if (loaded.issue.status === "draft") {
        await tx.issue.update({ where: { id: loaded.issue.id }, data: { status: "in_layout" } });
      }

      return placement;
    });
  } catch (error) {
    throw translateConstraintViolation(error);
  }
}

/**
 * The two constraint violations, in Hebrew.
 *
 * Reaching here means the domain check passed and something changed underneath
 * it — another tab, another designer. The message says so, because "try again"
 * is the correct advice and a 500 is not.
 */
function translateConstraintViolation(error: unknown): unknown {
  if (isExclusionViolation(error)) {
    return new PlacementRejected({
      code: "overlap",
      message: "השטח נתפס בינתיים על ידי שיבוץ אחר — רענני את הלוח ונסי מיקום אחר",
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new PlacementRejected({
      code: "duplicate",
      message: "הפרסום כבר משובץ בגיליון הזה",
    });
  }
  return error;
}

/**
 * Removes a placement (FR-5).
 *
 * A status change, never a delete: the row is the record of what happened, and
 * both constraints filter on `placed`, so a removed row frees its space without
 * erasing the history of having occupied it.
 */
export async function removePlacement(ctx: ActorContext, placementId: string) {
  const placement = await tenantDb(ctx.businessId).placement.findFirst({
    where: { id: placementId },
    include: {
      issue: { select: { id: true, status: true } },
      publication: { select: { id: true, status: true } },
    },
  });
  if (!placement) throw new Error("השיבוץ לא נמצא");
  requireEditable(placement.issue.status as IssueStatus, ctx.isAdmin);

  await basePrisma.$transaction(async (tx) => {
    await tx.placement.update({
      where: { id: placement.id },
      data: { status: "removed" },
    });

    const stillPlaced = await tx.placement.count({
      where: { publication_id: placement.publication_id, status: "placed" },
    });

    await tx.publication.update({
      where: { id: placement.publication_id },
      data: {
        status: transition(placement.publication.status as PublicationStatus, "PLACEMENT_REMOVED"),
        placement_status: stillPlaced > 0 ? "placed" : "not_placed",
      },
    });
  });
}

/**
 * Moves a placement. One transaction, the same rules (rule 14).
 *
 * Implemented as remove-then-place on purpose rather than an in-place UPDATE:
 * the exclusion constraint compares the row against its siblings, and a row
 * being moved must not be allowed to collide with where it used to be.
 */
export async function movePlacement(
  ctx: ActorContext,
  placementId: string,
  target: { pageId: string; col: number; row: number },
) {
  const existing = await tenantDb(ctx.businessId).placement.findFirst({
    where: { id: placementId, status: "placed" },
    select: {
      id: true,
      issue_id: true,
      publication_id: true,
      duplicate_override_approved: true,
    },
  });
  if (!existing) throw new Error("השיבוץ לא נמצא");

  const input: PlaceInput = {
    issueId: existing.issue_id,
    pageId: target.pageId,
    publicationId: existing.publication_id,
    col: target.col,
    row: target.row,
  };

  // Checked against the page WITHOUT this placement, so a nudge of one cell is
  // not refused for overlapping the space it is leaving.
  const loaded = await loadContext(ctx, input, placementId);
  const rejection = await checkLoaded(ctx, loaded);
  if (rejection) throw new PlacementRejected(rejection);

  const advertisementId = loaded.publication.advertisement_id;
  if (!advertisementId) throw new Error("לפרסום הזה עדיין אין מודעה");

  try {
    return await basePrisma.$transaction(async (tx) => {
      await tx.placement.update({ where: { id: placementId }, data: { status: "removed" } });
      return tx.placement.create({
        data: {
          issue_id: loaded.issue.id,
          issue_page_id: loaded.page.id,
          publication_id: loaded.publication.id,
          advertisement_id: advertisementId,
          ad_shape_id: loaded.shape.id,
          col: loaded.rect.col,
          row: loaded.rect.row,
          cols: loaded.rect.cols,
          rows: loaded.rect.rows,
          status: "placed",
          // Carried over, not reset: moving an ad that was already forgiven its
          // duplicate must not hand the unique index a second unflagged row.
          duplicate_override_approved: existing.duplicate_override_approved,
        },
      });
    });
  } catch (error) {
    throw translateConstraintViolation(error);
  }
}

/**
 * Admin-only approval of a second placement for one publication (FR-16).
 *
 * Marks the EXISTING placement as overridden, which is what lets the partial
 * unique index accept a second row. Audited, because it deliberately breaks a
 * rule the rest of the system relies on.
 */
export async function approveDuplicateOverride(
  ctx: ActorContext,
  issueId: string,
  publicationId: string,
) {
  // The row still carrying `false` is the one being forgiven; flagging an
  // already-flagged row would spend nothing and quietly allow one duplicate too
  // many. See overrideApproved for the arithmetic.
  const existing = await tenantDb(ctx.businessId).placement.findFirst({
    where: {
      issue_id: issueId,
      publication_id: publicationId,
      status: "placed",
      duplicate_override_approved: false,
    },
    orderBy: { created_at: "asc" },
    select: { id: true, issue_page_id: true },
  });
  if (!existing) throw new Error("אין שיבוץ קיים לאשר עליו חריגה");

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    {
      action: "override_duplicate_placement",
      targetType: "Publication",
      targetId: publicationId,
    },
    async (tx) => {
      await tx.placement.update({
        where: { id: existing.id },
        data: {
          duplicate_override_approved: true,
          duplicate_override_approved_by_user_id: ctx.userId,
          duplicate_override_approved_at: new Date(),
        },
      });
      return {
        old: { duplicate_override_approved: false },
        new: { duplicate_override_approved: true, issue_id: issueId },
      };
    },
  );
}

/* ---------------------------------------------------------- auto-placement */

export type AutoPlaceOutcome = {
  placed: number;
  /** How many sheets had to be opened to fit everything. */
  sheetsAdded: number;
  /** How many placements were cleared first, when rearranging. */
  cleared: number;
};

/**
 * Fills the issue with everything that is waiting, growing it as needed.
 *
 * ── Why it loops ─────────────────────────────────────────────────────────────
 * The decision was "the system adds as many pages as it needs to place all the
 * publications", so there is no giving up: pack what fits, add a sheet for the
 * rest, pack again. The loop is bounded anyway — a runaway that adds pages
 * forever because one ad can never be placed would be worse than a refusal.
 *
 * ── Why it writes one at a time ──────────────────────────────────────────────
 * Every placement goes through `placeAd`, so the twelve rules, the publication
 * state machine and the two database constraints all apply exactly as they do
 * to a drag. An auto-placer with its own write path is an auto-placer that
 * drifts from the rules it is supposed to obey.
 */
export async function autoPlaceIssue(
  ctx: ActorContext,
  issueId: string,
  seed = 1,
  /**
   * Clear the board first — what "another arrangement" means.
   *
   * Without it the packer only ever fills the gaps, so once everything is
   * placed there is nothing left to rearrange and the button that offers a
   * different layout can do nothing. With it, the issue is emptied and packed
   * again from a different seed. It removes HAND-placed ads too, which is why
   * the screen asks first.
   */
  reset = false,
): Promise<AutoPlaceOutcome> {
  const db = tenantDb(ctx.businessId);

  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { id: true, status: true, newspaper_id: true, issue_date: true },
  });
  if (!issue) throw new Error("הגיליון לא נמצא");
  requireEditable(issue.status as IssueStatus, ctx.isAdmin);

  let placed = 0;
  let sheetsAdded = 0;
  let cleared = 0;

  if (reset) {
    const existing = await db.placement.findMany({
      where: { issue_id: issueId, status: "placed" },
      select: { id: true },
    });
    for (const placement of existing) {
      // Through removePlacement, so each publication's status walks back
      // through the state machine exactly as it would by hand (FR-5).
      await removePlacement(ctx, placement.id);
      cleared++;
    }
  }

  // Each round places what fits and then grows the issue by the smallest
  // number of sheets the leftovers could possibly need. Bounded so a single
  // unplaceable ad cannot inflate an issue without end.
  for (let round = 0; round < MAX_AUTO_ROUNDS; round++) {
    const plan = await planAutoPlacement(ctx, issueId, seed + round);
    if (!plan) break;

    for (const placement of plan.placements) {
      try {
        await placeAd(ctx, {
          issueId,
          pageId: placement.pageId,
          publicationId: placement.publicationId,
          col: placement.col,
          row: placement.row,
        });
        placed++;
      } catch (error) {
        // A rule refused it after all — another tab, or a shape the plan and
        // the server disagree about. Skipping is right: the next round replans
        // against what actually landed.
        if (!(error instanceof PlacementRejected)) throw error;
      }
    }

    if (plan.unplaced.length === 0) break;
    // Nothing landed AND nothing fits: growing again would not help.
    if (plan.placements.length === 0 && sheetsAdded > 0 && plan.sheets === 0) break;

    const sheets = Math.max(1, plan.sheets);
    for (let i = 0; i < sheets; i++) {
      await addSheetTo(ctx.businessId, issueId, issue.newspaper_id);
      sheetsAdded++;
    }
  }

  return { placed, sheetsAdded, cleared };
}

/** Above this the issue is growing for a reason no extra page will fix. */
const MAX_AUTO_ROUNDS = 12;

/** What the packer would do right now, without writing anything. */
async function planAutoPlacement(ctx: ActorContext, issueId: string, seed: number) {
  const db = tenantDb(ctx.businessId);

  const issue = await db.issue.findUnique({
    where: { id: issueId },
    include: {
      pages: {
        orderBy: { page_number: "asc" },
        include: {
          reservations: { orderBy: { name: "asc" } },
          page_type: {
            select: {
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
        where: { status: "placed" },
        select: { issue_page_id: true, col: true, row: true, cols: true, rows: true },
      },
    },
  });
  if (!issue) return null;

  const grid = gridOfIssue(issue);
  if (!grid) return null;

  const occupiedByPage = new Map<string, GridRect[]>();
  for (const p of issue.placements) {
    const list = occupiedByPage.get(p.issue_page_id) ?? [];
    list.push({ col: p.col, row: p.row, cols: p.cols, rows: p.rows });
    occupiedByPage.set(p.issue_page_id, list);
  }

  const placedPublicationIds = new Set(
    (
      await db.placement.findMany({
        where: { issue_id: issueId, status: "placed" },
        select: { publication_id: true },
      })
    ).map((p) => p.publication_id),
  );

  // Only what a person would be allowed to drag: artwork present, valid, and
  // belonging to the publication's own customer (US-005 AC-4).
  const waiting = (
    await db.publication.findMany({
      where: {
        newspaper_id: issue.newspaper_id,
        publication_date: issue.issue_date,
        status: { notIn: ["canceled"] },
        id: { notIn: [...placedPublicationIds] },
      },
      orderBy: { created_at: "asc" },
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
        advertisement: { select: { customer_id: true, status: true, validation_status: true } },
      },
    })
  ).filter(
    (p) =>
      p.advertisement !== null &&
      p.advertisement.status !== "archived" &&
      p.advertisement.validation_status === "passed" &&
      p.advertisement.customer_id === p.customer_id,
  );

  const items: AutoPlaceItem[] = waiting.map((p) => ({
    publicationId: p.id,
    shape: {
      id: p.ad_shape.id,
      name: p.ad_shape.name,
      cols: p.ad_shape.cols,
      rows: p.ad_shape.rows,
      positions:
        p.ad_shape.position_mode === "region" ? readAllowedCells(p.ad_shape.allowed_cells) : null,
    },
  }));

  const pages: AutoPlacePage[] = issue.pages.map((page) => ({
    pageId: page.id,
    pageNumber: page.page_number,
    allowedShapes: shapeSpecsOf(page),
    // A reserved area is not a placement and never will be, but to a packer it
    // is exactly as unavailable as one (backlog item 14).
    occupied: [
      ...(occupiedByPage.get(page.id) ?? []),
      ...reservedOf(page).map((area) => area.rect),
    ],
  }));

  const result = autoPlace(items, pages, grid, seed);
  return { ...result, sheets: sheetsNeededFor(result.unplaced, grid) };
}

/**
 * Adds one sheet — two inner pages — before the back page.
 *
 * The type is the one the issue already uses for its inner pages, so a grown
 * issue is composed the way the person composed it. The back page stays last:
 * it is the outside of the folded sheet.
 */
async function addSheetTo(businessId: string, issueId: string, newspaperId: string) {
  const pages = await tenantDb(businessId).issuePage.findMany({
    where: { issue_id: issueId },
    orderBy: { page_number: "asc" },
    select: { id: true, page_number: true, page_type_id: true },
  });

  // The inner type in use, or — on an issue with no inside yet — whatever the
  // newspaper offers that is not the cover's type.
  const inner = pages.length > 2 ? pages[1]!.page_type_id : null;
  const fallback = (
    await tenantDb(businessId).pageType.findFirst({
      where: { newspaper_id: newspaperId, id: { not: pages[0]?.page_type_id } },
      select: { id: true },
    })
  )?.id;

  const pageTypeId = inner ?? fallback ?? pages[0]?.page_type_id;
  if (!pageTypeId) throw new Error("לעיתון אין סוג עמוד להוסיף");

  const before = pages.length >= 2 ? pages[pages.length - 2]! : pages[0]!;
  await insertIssuePages(businessId, issueId, pageTypeId, before.id);
}
