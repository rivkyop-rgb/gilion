/**
 * Grid geometry for ad placement (FR-14, US-006, US-007).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Coordinates are INTEGER GRID UNITS, not percentages and not millimetres. The
 * page is physically divided into columns and rows (lib/domain/grid.ts), so a
 * position that is not a whole number of cells is not a position a newspaper can
 * print. Integers are also their own snapping: there is no rounding step to get
 * wrong, and equality is exact.
 *
 * ── The one rule everything here exists to protect ────────────────────────────
 * `col = 0` is the START of the reading order, which in an RTL newspaper is the
 * RIGHT edge of the page. Growing `col` walks LEFTWARD.
 *
 * This is not decoration. The previous canvas measured the pointer from the left
 * edge but painted with `insetInlineStart` — which `dir="rtl"` resolves to
 * `right` — so every rectangle appeared mirrored, and the tests never noticed
 * because they only counted rectangles. So: exactly one function in this
 * codebase turns a grid coordinate into a left-origin millimetre
 * (`toMillimetres`), and exactly one turns a pointer into a cell
 * (`cellAtPointer`). Both are pure, so the rule is provable in a unit test
 * rather than only observable in a browser. Nothing else may do this
 * arithmetic — stage 07's print output depends on that staying true.
 *
 * Stage 06 reuses this module for placement, so the same overlap rule governs
 * both the shape catalogue and filling an issue.
 */
import { footprintMm, type DerivedGrid } from "./grid";

/** A rectangle in grid cells. `col`/`row` are the start corner; see the RTL rule. */
export type GridRect = { col: number; row: number; cols: number; rows: number };

/** A single grid cell. */
export type Cell = readonly [col: number, row: number];

/** Millimetres, measured from the page's physical top-LEFT corner (for PDF). */
export type MmRect = { xMm: number; yMm: number; widthMm: number; heightMm: number };

export type GeometryError =
  | { kind: "out_of_bounds"; message: string }
  | { kind: "non_positive"; message: string }
  | { kind: "outside_region"; message: string }
  | { kind: "overlap"; message: string; withIndex: number };

// ---------------------------------------------------------------------------
// Bounds and overlap
// ---------------------------------------------------------------------------

export function validateRect(rect: GridRect, grid: DerivedGrid): GeometryError | null {
  if (!Number.isInteger(rect.col) || !Number.isInteger(rect.row)) {
    return { kind: "non_positive", message: "מיקום חייב להיות במספרי תאים שלמים" };
  }
  if (!Number.isInteger(rect.cols) || !Number.isInteger(rect.rows)) {
    return { kind: "non_positive", message: "גודל חייב להיות במספרי תאים שלמים" };
  }
  if (rect.cols < 1 || rect.rows < 1) {
    return { kind: "non_positive", message: "לצורה חייבים להיות רוחב וגובה של תא אחד לפחות" };
  }
  if (rect.col < 0 || rect.row < 0) {
    return { kind: "out_of_bounds", message: "הצורה חורגת מגבולות העמוד" };
  }
  // col grows leftward, so this is the LEFT edge of the page, not the right.
  if (rect.col + rect.cols > grid.columns || rect.row + rect.rows > grid.rows) {
    return { kind: "out_of_bounds", message: "הצורה חורגת מגבולות העמוד" };
  }
  return null;
}

/**
 * True when two rectangles share any cell.
 *
 * Touching edges are allowed: two ads side by side at cols 0-2 and 3-5 are a
 * normal layout, not a conflict. The comparison is therefore strict — an
 * overlap needs at least one cell actually in common.
 */
export function overlaps(a: GridRect, b: GridRect): boolean {
  const separated =
    a.col + a.cols <= b.col ||
    b.col + b.cols <= a.col ||
    a.row + a.rows <= b.row ||
    b.row + b.rows <= a.row;
  return !separated;
}

/** Cells shared by two rectangles. */
export function overlapArea(a: GridRect, b: GridRect): number {
  const w = Math.min(a.col + a.cols, b.col + b.cols) - Math.max(a.col, b.col);
  const h = Math.min(a.row + a.rows, b.row + b.rows) - Math.max(a.row, b.row);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Validates one placement against the page, its shape's allowed region and its
 * siblings. `others` must exclude the rectangle being edited.
 */
export function validatePlacement(
  rect: GridRect,
  others: GridRect[],
  grid: DerivedGrid,
  positions: Cell[] | null = null,
): GeometryError | null {
  const bounds = validateRect(rect, grid);
  if (bounds) return bounds;

  if (!positionAllowed(rect, positions)) {
    return {
      kind: "outside_region",
      message: "הצורה הזאת לא מותרת במיקום הזה בעמוד",
    };
  }

  for (const [index, other] of others.entries()) {
    if (overlaps(rect, other)) {
      return {
        kind: "overlap",
        message: "המיקום חופף לשיבוץ אחר באותו עמוד",
        withIndex: index,
      };
    }
  }
  return null;
}

/** Every overlapping pair on a page — what the canvas highlights in red. */
export function findOverlappingPairs(rects: GridRect[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i]!, rects[j]!)) pairs.push([i, j]);
    }
  }
  return pairs;
}

/** Percentage of the page's cells covered — shown as page fill. */
export function coverage(rects: GridRect[], grid: DerivedGrid): number {
  const total = grid.columns * grid.rows;
  if (total <= 0) return 0;
  const used = rects.reduce((sum, r) => sum + r.cols * r.rows, 0);
  return (used / total) * 100;
}

// ---------------------------------------------------------------------------
// Allowed regions (US-006 AC-4)
// ---------------------------------------------------------------------------

const cellKey = (col: number, row: number) => `${col},${row}`;

/** Every cell a rectangle occupies. */
export function cellsOf(rect: GridRect): Cell[] {
  const cells: Cell[] = [];
  for (let c = rect.col; c < rect.col + rect.cols; c++) {
    for (let r = rect.row; r < rect.row + rect.rows; r++) cells.push([c, r]);
  }
  return cells;
}

/**
 * Where a shape is allowed to sit, stored as the set of POSITIONS it may be
 * placed at — the top-start cell of the footprint, not the cells it covers.
 *
 * Positions, not painted cells: the person setting this up thinks "this ad may
 * go here", picks up the shape at its real size and puts it down. Asking them
 * to paint an area instead means doing the footprint arithmetic in their head,
 * and a painted area one cell too small silently makes the shape unplaceable.
 * `null` means "anywhere it fits".
 */
export function positionAllowed(rect: GridRect, positions: Cell[] | null): boolean {
  if (positions === null) return true;
  return positions.some(([c, r]) => c === rect.col && r === rect.row);
}

/** Every position a shape of this size can occupy on the grid at all. */
export function positionsFor(shape: { cols: number; rows: number }, grid: DerivedGrid): Cell[] {
  const out: Cell[] = [];
  if (shape.cols < 1 || shape.rows < 1) return out;
  for (let row = 0; row + shape.rows <= grid.rows; row++) {
    for (let col = 0; col + shape.cols <= grid.columns; col++) out.push([col, row]);
  }
  return out;
}

/**
 * Drops duplicates, and any position where the shape would hang off the page.
 *
 * That last part is what makes an impossible setting unrepresentable rather
 * than merely discouraged: a stored position always fits.
 */
export function normalizePositions(
  positions: Cell[],
  shape: { cols: number; rows: number },
  grid: DerivedGrid,
): Cell[] {
  const seen = new Map<string, Cell>();
  for (const [c, r] of positions) {
    if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
    if (c < 0 || r < 0) continue;
    if (c + shape.cols > grid.columns || r + shape.rows > grid.rows) continue;
    seen.set(cellKey(c, r), [c, r]);
  }
  return [...seen.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * How many positions a shape of this size actually has.
 *
 * Zero is the failure the settings UI must catch: a shape with no allowed
 * position is unplaceable everywhere, which looks like a bug in the placement
 * screen rather than a bad setting.
 */
export function validPositionCount(
  shape: { cols: number; rows: number },
  positions: Cell[] | null,
  grid: DerivedGrid,
): number {
  if (positions === null) return positionsFor(shape, grid).length;
  return normalizePositions(positions, shape, grid).length;
}

// ---------------------------------------------------------------------------
// The conversion boundary — see the RTL rule at the top of this file
// ---------------------------------------------------------------------------

/**
 * THE one place a grid coordinate becomes a millimetre.
 *
 * `col = 0` is the RTL start, i.e. the page's RIGHT edge, but the returned
 * `xMm` is measured from the physical LEFT edge because that is what `@page`
 * and PDF output need. The mirror happens here and nowhere else.
 */
export function toMillimetres(rect: GridRect, grid: DerivedGrid): MmRect {
  // One formula for a footprint's printed size, shared with the settings screens
  // so a shape can never measure one thing in the form and another in the PDF.
  const { widthMm, heightMm } = footprintMm(rect, grid);

  // Distance from the page's right edge to the rectangle's right edge.
  const startFromRightMm =
    grid.marginMm + grid.gutterMm + rect.col * (grid.columnWidthMm + grid.gutterMm);

  return {
    xMm: grid.pageWidthMm - startFromRightMm - widthMm,
    yMm: grid.marginMm + grid.gutterMm + rect.row * (grid.rowHeightMm + grid.gutterMm),
    widthMm,
    heightMm,
  };
}

/**
 * Percentages for a canvas that positions with `insetInlineStart`.
 *
 * `startPct` is measured from the inline start, which `dir="rtl"` puts at the
 * right — so it agrees with `col` without any mirroring. Assumes the canvas
 * divides its box into equal cells, which is what a CSS grid of `1fr` tracks
 * does; the gutter is drawn by the cells themselves, not by this maths.
 */
export function toCanvasPercent(
  rect: GridRect,
  grid: DerivedGrid,
): { startPct: number; topPct: number; widthPct: number; heightPct: number } {
  return {
    startPct: (rect.col / grid.columns) * 100,
    topPct: (rect.row / grid.rows) * 100,
    widthPct: (rect.cols / grid.columns) * 100,
    heightPct: (rect.rows / grid.rows) * 100,
  };
}

/**
 * THE one place a pointer position becomes a cell.
 *
 * The horizontal distance is measured from `box.right`, because `col = 0` is
 * the RTL start. Measuring from `box.left` here is exactly the bug that shipped
 * in the template canvas, which is why this is a pure function taking a plain
 * rectangle: it can be asserted in a unit test without a browser.
 */
export function cellAtPointer(
  point: { clientX: number; clientY: number },
  box: { top: number; right: number; width: number; height: number },
  grid: DerivedGrid,
): Cell {
  const fromRight = (box.right - point.clientX) / box.width;
  const fromTop = (point.clientY - box.top) / box.height;
  const col = clamp(Math.floor(fromRight * grid.columns), 0, grid.columns - 1);
  const row = clamp(Math.floor(fromTop * grid.rows), 0, grid.rows - 1);
  return [col, row];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Builds the rectangle spanned by two cells, in either drag direction. */
export function rectBetween(a: Cell, b: Cell): GridRect {
  const col = Math.min(a[0], b[0]);
  const row = Math.min(a[1], b[1]);
  return {
    col,
    row,
    cols: Math.abs(a[0] - b[0]) + 1,
    rows: Math.abs(a[1] - b[1]) + 1,
  };
}
