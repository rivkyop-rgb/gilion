/**
 * Keeping the shape catalogue proportional when the page changes size.
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * ── The problem this exists for ──────────────────────────────────────────────
 * `base-shapes.ts` defines the catalogue as RATIOS, and `materializeBaseShapes`
 * resolves them into grid cells exactly once — when the newspaper is created.
 * Editing the newspaper afterwards changed the grid and left the shapes where
 * they were, which produced three failures in rising order of nastiness:
 *
 *   1. "חצי עמוד" stopped being half a page. Merely wrong.
 *   2. A shape taller than the new page stopped fitting ANYWHERE, so the
 *      pricing matrix marked every combination using it impossible and nobody
 *      could see why.
 *   3. A region-constrained shape lost its positions entirely. `allowed_cells`
 *      holds ABSOLUTE coordinates, and `normalizePositions` drops the ones that
 *      no longer fit — so the bottom strip, allowed only on row 34, had zero
 *      legal positions on a 27-row page. The comment on `validPositionCount`
 *      calls that "a bug in the placement screen rather than a bad setting",
 *      which is exactly how it read.
 *
 * ── What it does NOT touch ───────────────────────────────────────────────────
 * Shapes the newspaper invented, and shapes whose size somebody typed. Decided
 * by the user on 06/09/2026: the catalogue's proportions are the catalogue's
 * business, and a number a person entered is theirs. `base_key` records the
 * provenance and `AdShape.base_key` is cleared the moment a size is edited.
 *
 * Existing ISSUES are untouched by construction and not by care here: an issue
 * snapshots its grid and every placement carries its own geometry
 * (conventions.md §7 rule 2). Rescaling the catalogue changes what can be sold
 * from now on, and cannot move an ad that has already been laid out.
 */
import { BASE_SHAPES } from "./base-shapes";
import type { DerivedGrid } from "./grid";
import { formatCm, footprintMm } from "./grid";
import { normalizePositions, validPositionCount, type Cell } from "./slot-geometry";

export type RescaleShape = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  positionMode: "anywhere" | "region";
  allowedCells: Cell[] | null;
  /** Which base entry this came from, or null when the newspaper made it. */
  baseKey: string | null;
};

/** What happens to one shape, and why — the row the confirmation screen shows. */
export type ShapeChange = {
  id: string;
  name: string;
  from: { cols: number; rows: number };
  to: { cols: number; rows: number };
  allowedCells: Cell[] | null;
  /**
   * `rescaled`  — a base shape, moved to keep its ratio.
   * `kept`      — the newspaper's own, or a size somebody typed. Left alone.
   * `detached`  — carries a base_key but its size is no longer what that ratio
   *               gives, so it is treated as the newspaper's own from here on.
   * `unfittable`— left alone, and it does not fit the new page. A warning, not
   *               a change: resizing somebody's shape to rescue it would be the
   *               system overruling them.
   */
  action: "rescaled" | "kept" | "detached" | "unfittable";
  /** Hebrew, shown next to the row. Null when there is nothing to say. */
  note: string | null;
};

export type RescalePlan = {
  changes: ShapeChange[];
  /** Only the rows that actually move — what the writer applies. */
  rescaled: ShapeChange[];
  /** Rows that need a person to look at them. */
  warnings: ShapeChange[];
};

/** The ratio behind a base key, or null when the key is not one of ours. */
function ratioOf(key: string | null) {
  if (!key) return null;
  return BASE_SHAPES.find((b) => b.key === key) ?? null;
}

/**
 * The size a ratio produces on a grid.
 *
 * Identical arithmetic to `materializeBaseShapes`, deliberately: a shape
 * created on this grid and a shape rescaled onto it must land on the same
 * number, or "half a page" would mean two different things depending on
 * whether the newspaper was ever edited.
 */
export function sizeForRatio(
  base: { colsRatio: number; rowsRatio: number },
  grid: DerivedGrid,
): { cols: number; rows: number } {
  return {
    cols: Math.min(grid.columns, Math.max(1, Math.round(grid.columns * base.colsRatio))),
    rows: Math.min(grid.rows, Math.max(1, Math.round(grid.rows * base.rowsRatio))),
  };
}

/** Every position flush against the foot of the page — mirrors base-shapes.ts. */
function bottomPositions(shape: { cols: number; rows: number }, grid: DerivedGrid): Cell[] {
  const row = grid.rows - shape.rows;
  const positions: Cell[] = [];
  for (let col = 0; col + shape.cols <= grid.columns; col++) positions.push([col, row]);
  return normalizePositions(positions, shape, grid);
}

/**
 * What changing the grid does to a catalogue.
 *
 * Read-only: it decides, it does not write. The settings screen shows this
 * BEFORE saving, because a number that changes itself without warning reads as
 * a bug — the same rule the centimetre snapping already follows (CLAUDE.md).
 */
export function planRescale(
  shapes: readonly RescaleShape[],
  from: DerivedGrid,
  to: DerivedGrid,
): RescalePlan {
  const changes = shapes.map((shape): ShapeChange => {
    const unchanged = {
      id: shape.id,
      name: shape.name,
      from: { cols: shape.cols, rows: shape.rows },
      to: { cols: shape.cols, rows: shape.rows },
      allowedCells: shape.allowedCells,
    };

    const base = ratioOf(shape.baseKey);

    // The newspaper's own shape. It keeps its size — but if the new page cannot
    // hold it, somebody has to be told rather than left to discover it when the
    // pricing matrix goes grey.
    if (!base) return { ...unchanged, ...fitVerdict(shape, to) };

    // Carries a base key, but its size is not what that ratio gives on the grid
    // it is leaving. Somebody typed over it at some point — possibly before
    // base_key existed at all, which is why the backfill could only match on a
    // name. Their number wins, and the row stops claiming a provenance it no
    // longer has.
    const wasAtRatio = sizeForRatio(base, from);
    if (wasAtRatio.cols !== shape.cols || wasAtRatio.rows !== shape.rows) {
      return {
        ...unchanged,
        action: "detached",
        note: "הגודל נקבע ידנית — נשאר כפי שהוא",
      };
    }

    const next = sizeForRatio(base, to);
    const allowedCells =
      shape.positionMode === "region" ? bottomPositions(next, to) : shape.allowedCells;

    if (next.cols === shape.cols && next.rows === shape.rows) {
      return { ...unchanged, allowedCells, action: "kept", note: null };
    }

    // The printed size, and ONLY when it actually moves.
    //
    // Halving 41 rows of 1 cm and halving 27 rows of 1.5 cm both come out at
    // 21 cm — the cell count changes and the paper does not, which is the whole
    // point. Printing "21.0 → 21.0" next to that is noise that teaches the
    // reader to skip the column where the real changes also live.
    const before = sizeLabelOf(shape, from);
    const after = sizeLabelOf(next, to);

    return {
      id: shape.id,
      name: shape.name,
      from: { cols: shape.cols, rows: shape.rows },
      to: next,
      allowedCells,
      action: "rescaled",
      note: before === after ? null : `${before} → ${after} ס״מ`,
    };
  });

  return {
    changes,
    rescaled: changes.filter((c) => c.action === "rescaled"),
    warnings: changes.filter((c) => c.action === "unfittable"),
  };
}

/** Does a shape the system must not resize still work on the new page? */
function fitVerdict(shape: RescaleShape, to: DerivedGrid): Pick<ShapeChange, "action" | "note"> {
  if (shape.cols > to.columns || shape.rows > to.rows) {
    return { action: "unfittable", note: "גדולה מהעמוד החדש — לא תיכנס לשום מקום" };
  }
  if (validPositionCount(shape, shape.allowedCells, to) === 0) {
    return { action: "unfittable", note: "האזור המותר שלה יצא מגבולות העמוד החדש" };
  }
  return { action: "kept", note: null };
}

/** "13.0 × 21.0" — centimetres, the only unit this interface shows (§1). */
function sizeLabelOf(rect: { cols: number; rows: number }, grid: DerivedGrid): string {
  const { widthMm, heightMm } = footprintMm(rect, grid);
  return `${formatCm(widthMm)} × ${formatCm(heightMm)}`;
}

/** True when two grids differ in any way a shape's size depends on. */
export function gridChanged(a: DerivedGrid, b: DerivedGrid): boolean {
  return a.columns !== b.columns || a.rows !== b.rows;
}
