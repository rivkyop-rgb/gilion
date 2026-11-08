/**
 * The starting shape catalogue every newspaper is created with (US-006).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * These are defined as RATIOS of the page, not as cell counts, because the grid
 * differs between newspapers: "half a page" is 12 rows on a 24-row grid and 15
 * on a 30-row one. `materializeBaseShapes` resolves them against one grid.
 *
 * They are a starting point, not a fixed list. The newspaper owns its copies
 * and may rename, resize, delete or add to them — that is the whole point of
 * the catalogue being tenant-owned rather than global.
 */
import type { DerivedGrid } from "./grid";
import { normalizePositions, type Cell } from "./slot-geometry";

/** Where a base shape is allowed to sit, before it is resolved to cells. */
type BaseRegion = "anywhere" | "bottom";

export type BaseShape = {
  /** Stable key, used by the seed to keep fixture ids predictable. */
  key: string;
  name: string;
  colsRatio: number;
  rowsRatio: number;
  region: BaseRegion;
  /**
   * The name promises a fraction of the page — "חצי", "רבע", "שמינית" — so it
   * is created only on a grid where that fraction is exact (08/11/2026). A
   * customer who pays for half a page gets half a page, never 40% of it.
   */
  exact?: boolean;
};

/** Ordered largest first — the order the catalogue screen lists them in. */
export const BASE_SHAPES: readonly BaseShape[] = [
  { key: "full", name: "עמוד מלא", colsRatio: 1, rowsRatio: 1, region: "anywhere" },
  {
    key: "half_h",
    name: "חצי עמוד אופקי",
    colsRatio: 1,
    rowsRatio: 1 / 2,
    region: "anywhere",
    exact: true,
  },
  {
    key: "half_v",
    name: "חצי עמוד אנכי",
    colsRatio: 1 / 2,
    rowsRatio: 1,
    region: "anywhere",
    exact: true,
  },
  {
    key: "quarter",
    name: "רבע עמוד",
    colsRatio: 1 / 2,
    rowsRatio: 1 / 2,
    region: "anywhere",
    exact: true,
  },
  {
    key: "eighth",
    name: "שמינית עמוד",
    colsRatio: 1 / 2,
    rowsRatio: 1 / 4,
    region: "anywhere",
    exact: true,
  },
  // The strip is deliberately position-constrained: it gives every new
  // newspaper a worked example of an allowed region to copy from.
  { key: "strip", name: "רצועה תחתונה", colsRatio: 1, rowsRatio: 1 / 6, region: "bottom" },
];

/**
 * The three page types every newspaper starts with (user, 04/10/2026: "בכל
 * עיתון אמור להיות מוגדר באופן דיפולטיבי — שער, גב ופנימי").
 *
 * A newspaper with no page types cannot be ordered in at all — the order
 * builder has nothing to offer and the issue builder has nothing to compose
 * from. Leaving them to be invented meant the first thing anyone did with a
 * new newspaper was type the word "שער" into a settings screen, and the second
 * was discover that the issue board treats page 1 as the cover whatever it is
 * called.
 *
 * `cover` and `back` are named to match `defaultPageTypeIds` in
 * issue-layout.ts, which guesses the composition of a new issue from these
 * names. They remain ordinary rows: renameable, deletable, and joinable by any
 * number of others the newspaper wants.
 */
export const BASE_PAGE_TYPES = ["שער", "פנימי", "גב"] as const;

/**
 * How to tell that a newspaper already HAS each base type, whatever it was
 * named in the end: a type counts when its name contains the word. "אחורי" is
 * the back too — the demo's own newspaper was named that way before the base
 * set existed. Same rule as `defaultPageTypeIds` in issue-layout.ts.
 */
export const BASE_PAGE_TYPE_MATCH: Record<(typeof BASE_PAGE_TYPES)[number], string[]> = {
  שער: ["שער"],
  פנימי: ["פנימי"],
  גב: ["גב", "אחורי"],
};

export type MaterializedShape = {
  key: string;
  name: string;
  cols: number;
  rows: number;
  positionMode: "anywhere" | "region";
  allowedCells: Cell[] | null;
};

/**
 * Every position that puts the shape flush against the bottom of the page.
 *
 * One row of positions, not a painted band: a position IS a placement, so the
 * only row that leaves the strip touching the page foot is the last one that
 * fits.
 */
function bottomPositions(shape: { cols: number; rows: number }, grid: DerivedGrid): Cell[] {
  const row = grid.rows - shape.rows;
  const positions: Cell[] = [];
  for (let col = 0; col + shape.cols <= grid.columns; col++) positions.push([col, row]);
  return normalizePositions(positions, shape, grid);
}

/** Is `t × ratio` a whole number of cells? */
function divides(t: number, ratio: number): boolean {
  const n = t * ratio;
  return Math.abs(n - Math.round(n)) < 1e-9 && Math.round(n) >= 1;
}

/**
 * Can this base shape be made exactly on this grid? Shapes that are not
 * `exact` (the strip) always can. A half on 5 columns cannot: a column is the
 * smallest unit an ad can occupy, so the choice is 2 (40%) or 3 (60%), and
 * neither is half.
 */
export function fitsExactly(base: BaseShape, grid: { columns: number; rows: number }): boolean {
  if (!base.exact) return true;
  // Columns only. A column is several centimetres, so rounding it is 40% vs
  // 50%. A row is about one centimetre and is chosen freely in the form, so
  // rows keep FLOOR (below) — at most one row under, and n copies still fit.
  return divides(grid.columns, base.colsRatio);
}

/**
 * The base shapes a grid cannot make exactly, in Hebrew, for the newspaper
 * form to say BEFORE saving — with the column counts that would make them.
 */
export function inexactShapesNote(grid: { columns: number; rows: number }): string | null {
  const missing = BASE_SHAPES.filter((b) => !fitsExactly(b, grid));
  if (missing.length === 0) return null;
  const names = missing.map((b) => b.name).join(", ");
  return (
    `${grid.columns} עמודות לא מתחלקות לשניים, ולכן לא ייווצרו: ${names}. ` +
    "מודעה תופסת עמודות שלמות, וחצי עמוד צריך להיות בדיוק חצי. " +
    `כדי שייווצרו — ${grid.columns - 1} או ${grid.columns + 1} עמודות.`
  );
}

/** Resolves the base catalogue against one newspaper's grid. */
export function materializeBaseShapes(grid: DerivedGrid): MaterializedShape[] {
  return BASE_SHAPES.filter((base) => fitsExactly(base, grid)).map((base) => {
    // FLOOR, not round — and this is the whole correctness of the catalogue.
    //
    // A shape called "half a page" has to have the property that TWO OF THEM
    // FIT. Rounding breaks exactly that: on a 41-row page, round(41 / 2) is 21,
    // so two halves need 42 rows and the second one does not go on. Four
    // quarters could not be laid on a page — which is not a subtle failure, it
    // is the most ordinary layout a newspaper has, and it surfaced as the
    // placement board refusing a corner with "no shape fits in what is left".
    //
    // floor(t / n) * n <= t for every n, so a shape declared as one nth of the
    // page always tiles n times. The cost is up to one cell of unused paper at
    // the foot, which is what a page that does not divide evenly actually has.
    const cols = Math.min(grid.columns, Math.max(1, Math.floor(grid.columns * base.colsRatio)));
    const rows = Math.min(grid.rows, Math.max(1, Math.floor(grid.rows * base.rowsRatio)));

    return {
      key: base.key,
      name: base.name,
      cols,
      rows,
      positionMode: base.region === "anywhere" ? ("anywhere" as const) : ("region" as const),
      allowedCells: base.region === "anywhere" ? null : bottomPositions({ cols, rows }, grid),
    };
  });
}
