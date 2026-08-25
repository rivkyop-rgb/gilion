/**
 * The page grid (US-006 AC-4, FR-14).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * A newspaper divides its page into `columns` columns and rows of
 * `rowHeightMm`. Only those two numbers plus the gutter are stored: the row
 * count and the column width are DERIVED here, every time, from the page size
 * and margin in force. Storing them would let a later change to page_size leave
 * a stale number in the database that contradicts the page it describes.
 *
 * The gutter is a single setting that applies between adjacent cells AND
 * between the outermost cells and the frame, so it appears `columns + 1` times
 * across the usable width. `margin` remains the physical page margin; the
 * gutter is the ring of air inside it.
 */
import { pageDimensions } from "./page-size";
import type { FieldError } from "./newspaper";

export const MIN_COLUMNS = 1;
/**
 * High enough for a 1 cm module on a broadsheet.
 *
 * The ceiling used to be 24, which quietly made a 1 cm column impossible on a
 * Tabloid page (26 of them) — and a coarse column is what stops a person
 * typing the size they actually want. See 03-newspaper-config.md deviation 13.
 */
export const MAX_COLUMNS = 40;

export type GridSettings = {
  pageSize: string;
  customWidthMm?: number | null;
  customHeightMm?: number | null;
  /** Millimetres. */
  marginMm: number;
  columns: number;
  /** Millimetres, one grid row. */
  rowHeightMm: number;
  /** Millimetres, between cells and against the frame. */
  gutterMm: number;
};

/** A grid with everything computable already computed. */
export type DerivedGrid = {
  columns: number;
  /** Derived — never stored. */
  rows: number;
  rowHeightMm: number;
  gutterMm: number;
  marginMm: number;
  /** Derived — never stored. */
  columnWidthMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
};

/**
 * Resolves a newspaper's stored settings into a usable grid, or null when the
 * page size cannot be resolved (a "custom" size missing its dimensions).
 *
 * Returns a grid even when it is degenerate (zero or negative column width, no
 * rows); `validateGridSettings` is what refuses those. Keeping the two apart
 * lets the settings form show a live readout of a grid the user has not
 * finished typing yet.
 */
export function deriveGrid(input: GridSettings): DerivedGrid | null {
  const dims = pageDimensions(input.pageSize, input.customWidthMm, input.customHeightMm);
  if (!dims) return null;

  const usableWidth = dims.width - 2 * input.marginMm;
  const usableHeight = dims.height - 2 * input.marginMm;

  // The gutter appears columns + 1 times: once between each pair of columns and
  // once at each edge.
  const columnWidthMm = (usableWidth - (input.columns + 1) * input.gutterMm) / input.columns;

  // rows·rowHeight + (rows + 1)·gutter <= usableHeight
  const rowPitch = input.rowHeightMm + input.gutterMm;
  const rows = rowPitch > 0 ? Math.floor((usableHeight - input.gutterMm) / rowPitch) : 0;

  return {
    columns: input.columns,
    rows: Math.max(0, rows),
    rowHeightMm: input.rowHeightMm,
    gutterMm: input.gutterMm,
    marginMm: input.marginMm,
    columnWidthMm,
    pageWidthMm: dims.width,
    pageHeightMm: dims.height,
  };
}

/** Validation rules for the three stored grid fields (US-006). */
export function validateGridSettings(input: GridSettings): FieldError[] {
  const errors: FieldError[] = [];

  if (!Number.isInteger(input.columns) || input.columns < MIN_COLUMNS) {
    errors.push({ field: "columns", message: "מספר העמודות חייב להיות מספר שלם של אחת לפחות" });
  } else if (input.columns > MAX_COLUMNS) {
    errors.push({ field: "columns", message: `מספר העמודות לא יכול לעלות על ${MAX_COLUMNS}` });
  }

  if (!Number.isFinite(input.rowHeightMm) || input.rowHeightMm <= 0) {
    errors.push({ field: "rowHeightMm", message: "גובה שורה חייב להיות גדול מאפס" });
  }

  if (!Number.isFinite(input.gutterMm) || input.gutterMm < 0) {
    errors.push({ field: "gutterMm", message: "המרווח חייב להיות אפס או יותר" });
  }

  // Only worth checking the derived numbers once the inputs themselves are sane.
  if (errors.length > 0) return errors;

  const grid = deriveGrid(input);
  if (!grid) return errors; // the page size is invalid — validateNewspaper reports that

  if (grid.columnWidthMm <= 0) {
    errors.push({
      field: "columns",
      message: "העמודות והמרווח לא נכנסים ברוחב העמוד — צמצמי את מספר העמודות או את המרווח",
    });
  }
  if (grid.rows < 1) {
    errors.push({
      field: "rowHeightMm",
      message: "גובה השורה והמרווח לא משאירים אף שורה בעמוד",
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Centimetres — the unit every human in this system actually thinks in
// ---------------------------------------------------------------------------
//
// The grid is what the database, the overlap constraint and the placement rules
// work in, because a cell is discrete and a centimetre is not. But nobody sells
// or buys "3 by 12 cells": a newspaper quotes an ad as "3 columns by 20 cm".
// So the UI is in centimetres in BOTH directions and these are the conversions,
// used by the forms and the catalogue alike.
//
// The one thing that cannot be made round is the column width: it is whatever
// the page width leaves after the margins and gutters, and it very rarely lands
// on a whole centimetre. That is why width is chosen in COLUMNS and only shown
// in centimetres, while height is chosen in centimetres directly.

export const MM_PER_CM = 10;

export const cmToMm = (cm: number) => cm * MM_PER_CM;
export const mmToCm = (mm: number) => mm / MM_PER_CM;

/** One decimal place — the precision a print shop works to. */
export function formatCm(mm: number): string {
  return (Math.round(mm) / MM_PER_CM).toFixed(1);
}

/** The printed size of a footprint of `cols` x `rows` cells. */
export function footprintMm(
  shape: { cols: number; rows: number },
  grid: DerivedGrid,
): { widthMm: number; heightMm: number } {
  return {
    // (n cells) + (n - 1 gutters between them). The gutter against the frame
    // belongs to the page, not to the shape.
    widthMm: shape.cols * grid.columnWidthMm + (shape.cols - 1) * grid.gutterMm,
    heightMm: shape.rows * grid.rowHeightMm + (shape.rows - 1) * grid.gutterMm,
  };
}

/**
 * How many whole rows come closest to a requested height in centimetres.
 *
 * Deliberately NOT clamped to the grid at the top end: a request taller than
 * the page must survive as a too-large number so the caller can refuse it with
 * a real message, instead of being silently trimmed to something the user did
 * not ask for.
 */
export function rowsForHeightCm(cm: number, grid: DerivedGrid): number {
  const pitch = grid.rowHeightMm + grid.gutterMm;
  if (!(pitch > 0) || !Number.isFinite(cm)) return 1;
  return Math.max(1, Math.round((cmToMm(cm) + grid.gutterMm) / pitch));
}

/** The same, for a requested width. Used only where width is typed, not picked. */
export function colsForWidthCm(cm: number, grid: DerivedGrid): number {
  const pitch = grid.columnWidthMm + grid.gutterMm;
  if (!(pitch > 0) || !Number.isFinite(cm)) return 1;
  return Math.max(1, Math.round((cmToMm(cm) + grid.gutterMm) / pitch));
}

/** True when a shape's footprint fits inside the grid at all. */
export function shapeFitsGrid(shape: { cols: number; rows: number }, grid: DerivedGrid): boolean {
  return (
    shape.cols >= 1 && shape.rows >= 1 && shape.cols <= grid.columns && shape.rows <= grid.rows
  );
}
