/**
 * The placement rules (US-007, FR-5, FR-14, FR-16).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Every reason an ad may not go where a designer just dropped it lives here, in
 * one ordered function, so that the board, the Server Action and the Vitest
 * suite all reject for the same reason in the same order. The database still
 * has the final word on the last two rules (`placement_no_overlap` and
 * `placement_publication_unique`) — two browser tabs beat any check made in
 * application code. What this module adds is the Hebrew sentence that says
 * WHICH rule was broken and points at the rectangle that broke it; a constraint
 * violation on its own is a 500 with a Postgres error code in it.
 *
 * Geometry is never computed here: bounds, overlap and allowed positions all
 * come from slot-geometry.ts, and the centimetres in the messages from grid.ts.
 */
import { footprintMm, formatCm, type DerivedGrid } from "./grid";
import type { IssueStatus } from "./issue-status";
import { isEditable, lockReason } from "./issue-status";
import { overlaps, positionAllowed, validateRect, type Cell, type GridRect } from "./slot-geometry";

/** A shape as the rules need it: a footprint plus where it may sit. */
/**
 * The placement states that are still ON the page.
 *
 * `placed` is the live one and the only one the two database constraints
 * filter on (conventions.md §4) — a published placement no longer needs
 * overlap protection, because the issue it belongs to is locked. But it is
 * still an ad on a page: every READ that draws, counts or checks an issue has
 * to include it, or a closed issue renders as a blank newspaper and its own
 * PDF reprints empty.
 *
 * `removed` is the third state and is deliberately not here — that is the
 * record of something a designer took off.
 */
/* Not `as const`: Prisma's `in` filter takes a MUTABLE array of the enum, and a
   readonly tuple is refused by the generated types. */
export const ON_PAGE_STATES: Array<"placed" | "published"> = ["placed", "published"];

export type ShapeSpec = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** null = anywhere it fits (AdShape.position_mode = anywhere). */
  positions: Cell[] | null;
};

/**
 * An area of the page that is not for sale (backlog item 14).
 *
 * The masthead, a standing logo strip: part of the page design rather than
 * something a customer bought. It behaves like a placement nobody owns —
 * it blocks, it counts against "how much is left to sell", and rule 7א sees
 * it — but it is never a `Placement`, because there is no order behind it and
 * nothing to invoice.
 */
export type ReservedArea = {
  name: string;
  rect: GridRect;
  /** Object key of the image drawn there, or null for a plain blocked area. */
  assetKey: string | null;
};

export type PlacementContext = {
  issue: {
    status: IssueStatus;
    newspaperId: string;
    /** yyyy-mm-dd. Compared as a string so no timezone can shift a date. */
    issueDate: string;
  };
  /** Admins alone may edit a `ready_for_print` issue and approve duplicates. */
  isAdmin: boolean;
  page: {
    /** Shapes this page type allows — AllowedAdShape, resolved (FR-14). */
    allowedShapes: ShapeSpec[];
    /** Areas of the page that are not for sale. Snapshotted per issue. */
    reserved: ReservedArea[];
  };
  publication: {
    newspaperId: string;
    publicationDate: string;
    customerId: string;
    shapeId: string;
  };
  /** null when the publication has no artwork yet — not placeable (US-005). */
  advertisement: {
    customerId: string | null;
    validationPassed: boolean;
    archived: boolean;
  } | null;
  /** The publication's own shape, which is what gets placed. */
  shape: ShapeSpec;
  rect: GridRect;
  /** The issue's SNAPSHOT grid, never the newspaper's live one (§7 rule 2). */
  grid: DerivedGrid;
  /** Other `placed` rectangles on the SAME page, excluding this one. */
  siblings: GridRect[];
  /** True when this publication already holds a placement in this issue. */
  alreadyInIssue: boolean;
  /** True once an admin approved the duplicate override for this publication. */
  duplicateOverrideApproved: boolean;
};

export type PlacementRejectionCode =
  | "issue_locked"
  | "wrong_newspaper"
  | "wrong_date"
  | "ad_missing"
  | "ad_missing_customer"
  | "ad_customer_mismatch"
  | "ad_not_validated"
  | "shape_not_allowed_on_page"
  | "out_of_bounds"
  | "size_mismatch"
  | "outside_region"
  | "dead_space"
  | "overlap"
  | "reserved"
  | "duplicate";

export type PlacementRejection = {
  code: PlacementRejectionCode;
  message: string;
  /** What the board highlights: the remainder, or the rectangle in the way. */
  rect?: GridRect;
};

/** "12.5 × 4.0 ס״מ" — the only unit any screen shows (conventions.md §1). */
export function sizeLabel(rect: { cols: number; rows: number }, grid: DerivedGrid): string {
  const { widthMm, heightMm } = footprintMm(rect, grid);
  return `${formatCm(widthMm)} × ${formatCm(heightMm)} ס״מ`;
}

/**
 * The whole rule set, in the order stage 06 specifies.
 *
 * Returns null when the placement is legal. The order matters: a designer who
 * dropped an ad on an occupied corner of a page that does not accept its shape
 * at all should be told about the shape, not about the corner.
 */
export function checkPlacement(ctx: PlacementContext): PlacementRejection | null {
  // 1 — is the issue open to this person at all (FR-6)?
  if (!isEditable(ctx.issue.status, ctx.isAdmin)) {
    return { code: "issue_locked", message: lockReason(ctx.issue.status, ctx.isAdmin)! };
  }

  // 2 — the publication belongs to this issue's newspaper and date.
  if (ctx.publication.newspaperId !== ctx.issue.newspaperId) {
    return { code: "wrong_newspaper", message: "הפרסום שייך לעיתון אחר" };
  }
  if (ctx.publication.publicationDate !== ctx.issue.issueDate) {
    return { code: "wrong_date", message: "הפרסום מתוכנן לתאריך אחר" };
  }

  // 3, 4 — the artwork (US-005 AC-4).
  const ad = ctx.advertisement;
  if (!ad) return { code: "ad_missing", message: "לפרסום הזה עדיין אין מודעה" };
  if (ad.archived) {
    return { code: "ad_not_validated", message: "המודעה בארכיון ואינה ניתנת לשיבוץ" };
  }
  if (!ad.customerId) {
    return {
      code: "ad_missing_customer",
      message: "המודעה אינה משויכת ללקוח ולכן אינה ניתנת לשיבוץ",
    };
  }
  if (ad.customerId !== ctx.publication.customerId) {
    return { code: "ad_customer_mismatch", message: "המודעה שייכת ללקוח אחר" };
  }
  if (!ad.validationPassed) {
    return { code: "ad_not_validated", message: "המודעה לא עברה ולידציה ולכן אינה ניתנת לשיבוץ" };
  }

  // 5 — the shape is allowed on this page type (US-007 AC-3, FR-14).
  const allowed = ctx.page.allowedShapes.find((s) => s.id === ctx.shape.id);
  if (!allowed) {
    return {
      code: "shape_not_allowed_on_page",
      message: `צורת הפרסום "${ctx.shape.name}" אינה מותרת בסוג העמוד הזה`,
    };
  }

  // 6 — inside the snapshot grid, and exactly the shape's own footprint.
  const bounds = validateRect(ctx.rect, ctx.grid);
  if (bounds) return { code: "out_of_bounds", message: bounds.message };
  if (ctx.rect.cols !== ctx.shape.cols || ctx.rect.rows !== ctx.shape.rows) {
    return {
      code: "size_mismatch",
      message: `הגודל אינו תואם לצורה "${ctx.shape.name}" (${sizeLabel(ctx.shape, ctx.grid)})`,
    };
  }

  // 7 — an explicit allowed region wins; "anywhere" falls through to rule 7א.
  if (!positionAllowed(ctx.rect, ctx.shape.positions)) {
    return { code: "outside_region", message: "הצורה אינה מותרת במיקום הזה בעמוד" };
  }

  // 8א — a reserved area. Checked BEFORE overlap because the two produce the
  // same collision and different sentences, and "the space is taken" is the
  // less useful of the two: nobody can free the masthead by moving an ad.
  for (const area of ctx.page.reserved) {
    if (overlaps(ctx.rect, area.rect)) {
      return {
        code: "reserved",
        message: `השטח שמור ל"${area.name}" ואינו נמכר`,
        rect: area.rect,
      };
    }
  }

  // 8 — overlap. Checked here for the sentence, enforced in the database for
  // the truth (conventions.md §4).
  for (const other of ctx.siblings) {
    if (overlaps(ctx.rect, other)) {
      return {
        code: "overlap",
        message: `השטח תפוס על ידי שיבוץ אחר (${sizeLabel(other, ctx.grid)})`,
        rect: other,
      };
    }
  }

  // 7א — no dead remainders. Runs after overlap so that a straightforward
  // collision is reported as a collision. Reserved areas count as occupied
  // here: a column stranded between an ad and the masthead is just as unsellable
  // as one stranded between two ads.
  const blocked = [...ctx.siblings, ...ctx.page.reserved.map((area) => area.rect)];
  const remainder = deadSpaceCreatedBy(ctx.rect, blocked, ctx.grid, ctx.page.allowedShapes);
  if (remainder) {
    return {
      code: "dead_space",
      message:
        `השיבוץ משאיר שטח פנוי של ${sizeLabel(remainder, ctx.grid)} ` +
        `שאף צורה בקטלוג לא נכנסת בו — הזיזי את המודעה או בחרי מיקום אחר`,
      rect: remainder,
    };
  }

  // 9 — one placement per publication per issue, unless an admin said otherwise
  // (FR-16). The partial unique index is what actually holds this.
  if (ctx.alreadyInIssue && !ctx.duplicateOverrideApproved) {
    return { code: "duplicate", message: "הפרסום כבר משובץ בגיליון הזה" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Rule 7א — "no dead remainders" (decision of 25/08/2026)
// ---------------------------------------------------------------------------
//
// Every free cell left on the page must be part of SOME footprint the catalogue
// can still sell there. A cell that no allowed shape can ever cover is space
// the newspaper cannot charge for, and this rule is what replaced marking
// permitted positions by hand (stage 03, deviation 14).
//
// The check is deliberately made twice — before the placement and after it —
// and only remainders the placement CREATED are refused. A page that was
// already awkward is not the designer's fault, and blocking them from it would
// leave an issue nobody can finish laying out.

/** 1 = occupied. Row-major, `row * columns + col`. */
export function occupancyOf(rects: readonly GridRect[], grid: DerivedGrid): Uint8Array {
  const cells = new Uint8Array(grid.columns * grid.rows);
  for (const r of rects) {
    for (let row = Math.max(0, r.row); row < Math.min(grid.rows, r.row + r.rows); row++) {
      for (let col = Math.max(0, r.col); col < Math.min(grid.columns, r.col + r.cols); col++) {
        cells[row * grid.columns + col] = 1;
      }
    }
  }
  return cells;
}

/**
 * "Is this whole block free?", in constant time.
 *
 * A summed-area table over the free cells. Built once and shared by every
 * caller below, because the alternative — a nested scan per candidate block —
 * is the quadruple loop a 40-column broadsheet would feel.
 */
function freeArea(occupied: Uint8Array, grid: DerivedGrid) {
  const C = grid.columns;
  const R = grid.rows;
  const sum = new Int32Array((R + 1) * (C + 1));
  for (let row = 0; row < R; row++) {
    for (let col = 0; col < C; col++) {
      const free = occupied[row * C + col] === 1 ? 0 : 1;
      sum[(row + 1) * (C + 1) + (col + 1)] =
        free +
        sum[row * (C + 1) + (col + 1)]! +
        sum[(row + 1) * (C + 1) + col]! -
        sum[row * (C + 1) + col]!;
    }
  }
  return (col: number, row: number, cols: number, rows: number) =>
    sum[(row + rows) * (C + 1) + (col + cols)]! -
    sum[row * (C + 1) + (col + cols)]! -
    sum[(row + rows) * (C + 1) + col]! +
    sum[row * (C + 1) + col]!;
}

/**
 * Every position a shape could still legally be dropped into, given what is
 * already on the page.
 *
 * Respects the shape's own allowed region, so a bottom-only strip is not
 * reported as fitting a gap at the top of the page.
 */
export function freePositionsFor(
  shape: ShapeSpec,
  occupied: Uint8Array,
  grid: DerivedGrid,
): Cell[] {
  const out: Cell[] = [];
  if (shape.cols < 1 || shape.rows < 1) return out;
  if (shape.cols > grid.columns || shape.rows > grid.rows) return out;

  const freeCount = freeArea(occupied, grid);
  const area = shape.cols * shape.rows;
  for (let row = 0; row + shape.rows <= grid.rows; row++) {
    for (let col = 0; col + shape.cols <= grid.columns; col++) {
      const rect: GridRect = { col, row, cols: shape.cols, rows: shape.rows };
      if (!positionAllowed(rect, shape.positions)) continue;
      if (freeCount(col, row, shape.cols, shape.rows) === area) out.push([col, row]);
    }
  }
  return out;
}

/**
 * Which of a page type's shapes still have somewhere to go — what the board
 * tells a seller about a page that is not yet full.
 *
 * Deliberately GEOMETRIC only: it answers "is there room", not "is every one
 * of those positions legal". Rule 7א can still refuse a particular drop for
 * stranding a remainder, and running it across every candidate position of
 * every shape on every page is quadratic in the page area — a number a
 * broadsheet feels on every render.
 *
 * The approximation is safe in the direction that matters. Rule 7א exists
 * precisely to stop unsellable gaps from forming, so a page built under it
 * rarely holds a gap that fits a shape at no legal position; and the cost of
 * being wrong is a seller told "a quarter still fits" who is then asked to
 * move it one column, not a bad layout reaching print.
 */
export function shapesThatFit(
  occupied: Uint8Array,
  grid: DerivedGrid,
  shapes: readonly ShapeSpec[],
): ShapeSpec[] {
  const freeCount = freeArea(occupied, grid);

  return shapes.filter((shape) => {
    if (shape.cols < 1 || shape.rows < 1) return false;
    if (shape.cols > grid.columns || shape.rows > grid.rows) return false;
    const area = shape.cols * shape.rows;
    for (let row = 0; row + shape.rows <= grid.rows; row++) {
      for (let col = 0; col + shape.cols <= grid.columns; col++) {
        const rect: GridRect = { col, row, cols: shape.cols, rows: shape.rows };
        if (!positionAllowed(rect, shape.positions)) continue;
        if (freeCount(col, row, shape.cols, shape.rows) === area) return true;
      }
    }
    return false;
  });
}

/**
 * Free cells no allowed shape can cover.
 *
 * A summed-area table answers "is this whole block free?" in constant time,
 * and a 2D difference array marks every coverable block in constant time each.
 */
export function deadCells(
  occupied: Uint8Array,
  grid: DerivedGrid,
  shapes: readonly ShapeSpec[],
): Cell[] {
  const C = grid.columns;
  const R = grid.rows;
  if (C <= 0 || R <= 0) return [];

  const freeCount = freeArea(occupied, grid);

  // Difference array: +1 / -1 at the corners of every coverable block.
  const diff = new Int32Array((R + 1) * (C + 1));
  for (const shape of shapes) {
    if (shape.cols < 1 || shape.rows < 1) continue;
    if (shape.cols > C || shape.rows > R) continue;
    const area = shape.cols * shape.rows;
    for (let row = 0; row + shape.rows <= R; row++) {
      for (let col = 0; col + shape.cols <= C; col++) {
        const rect: GridRect = { col, row, cols: shape.cols, rows: shape.rows };
        if (!positionAllowed(rect, shape.positions)) continue;
        if (freeCount(col, row, shape.cols, shape.rows) !== area) continue;
        diff[row * (C + 1) + col] = diff[row * (C + 1) + col]! + 1;
        diff[row * (C + 1) + col + shape.cols] = diff[row * (C + 1) + col + shape.cols]! - 1;
        diff[(row + shape.rows) * (C + 1) + col] = diff[(row + shape.rows) * (C + 1) + col]! - 1;
        diff[(row + shape.rows) * (C + 1) + col + shape.cols] =
          diff[(row + shape.rows) * (C + 1) + col + shape.cols]! + 1;
      }
    }
  }

  const dead: Cell[] = [];
  const running = new Int32Array((R + 1) * (C + 1));
  for (let row = 0; row < R; row++) {
    for (let col = 0; col < C; col++) {
      const i = row * (C + 1) + col;
      running[i] =
        diff[i]! +
        (row > 0 ? running[i - (C + 1)]! : 0) +
        (col > 0 ? running[i - 1]! : 0) -
        (row > 0 && col > 0 ? running[i - (C + 2)]! : 0);
      if (occupied[row * C + col] === 0 && running[i] === 0) dead.push([col, row]);
    }
  }
  return dead;
}

/**
 * The remainder this placement would strand, or null.
 *
 * Returns the bounding box of the largest newly dead region, because that is
 * what the board highlights and what the message measures in centimetres. A
 * bounding box rather than the exact cells: the designer needs to see WHERE,
 * and an outline is readable where a scatter of shaded cells is not.
 */
export function deadSpaceCreatedBy(
  rect: GridRect,
  siblings: readonly GridRect[],
  grid: DerivedGrid,
  shapes: readonly ShapeSpec[],
): GridRect | null {
  if (shapes.length === 0) return null;

  const before = new Set(
    deadCells(occupancyOf(siblings, grid), grid, shapes).map(([c, r]) => `${c},${r}`),
  );
  const after = deadCells(occupancyOf([...siblings, rect], grid), grid, shapes);

  const created = after.filter(([c, r]) => !before.has(`${c},${r}`));
  if (created.length === 0) return null;

  const regions = connectedRegions(created);
  regions.sort((a, b) => b.length - a.length);
  return boundingBox(regions[0]!);
}

/** Four-connected groups of cells — one stranded remainder each. */
function connectedRegions(cells: readonly Cell[]): Cell[][] {
  const key = (c: number, r: number) => `${c},${r}`;
  const remaining = new Map(cells.map((cell) => [key(cell[0], cell[1]), cell]));
  const regions: Cell[][] = [];

  for (const startKey of [...remaining.keys()]) {
    const start = remaining.get(startKey);
    if (!start) continue;
    const region: Cell[] = [];
    const stack: Cell[] = [start];
    remaining.delete(startKey);

    while (stack.length > 0) {
      const [c, r] = stack.pop()!;
      region.push([c, r]);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const k = key(c + dc, r + dr);
        const next = remaining.get(k);
        if (next) {
          remaining.delete(k);
          stack.push(next);
        }
      }
    }
    regions.push(region);
  }
  return regions;
}

export function boundingBox(cells: readonly Cell[]): GridRect {
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  for (const [c, r] of cells) {
    if (c < minC) minC = c;
    if (r < minR) minR = r;
    if (c > maxC) maxC = c;
    if (r > maxR) maxR = r;
  }
  return { col: minC, row: minR, cols: maxC - minC + 1, rows: maxR - minR + 1 };
}
