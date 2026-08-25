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
};

/** Ordered largest first — the order the catalogue screen lists them in. */
export const BASE_SHAPES: readonly BaseShape[] = [
  { key: "full", name: "עמוד מלא", colsRatio: 1, rowsRatio: 1, region: "anywhere" },
  { key: "half_h", name: "חצי עמוד אופקי", colsRatio: 1, rowsRatio: 1 / 2, region: "anywhere" },
  { key: "half_v", name: "חצי עמוד אנכי", colsRatio: 1 / 2, rowsRatio: 1, region: "anywhere" },
  { key: "quarter", name: "רבע עמוד", colsRatio: 1 / 2, rowsRatio: 1 / 2, region: "anywhere" },
  { key: "eighth", name: "שמינית עמוד", colsRatio: 1 / 2, rowsRatio: 1 / 4, region: "anywhere" },
  // The strip is deliberately position-constrained: it gives every new
  // newspaper a worked example of an allowed region to copy from.
  { key: "strip", name: "רצועה תחתונה", colsRatio: 1, rowsRatio: 1 / 6, region: "bottom" },
];

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

/** Resolves the base catalogue against one newspaper's grid. */
export function materializeBaseShapes(grid: DerivedGrid): MaterializedShape[] {
  return BASE_SHAPES.map((base) => {
    // Never round down to zero, and never wider or taller than the page.
    const cols = Math.min(grid.columns, Math.max(1, Math.round(grid.columns * base.colsRatio)));
    const rows = Math.min(grid.rows, Math.max(1, Math.round(grid.rows * base.rowsRatio)));

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
