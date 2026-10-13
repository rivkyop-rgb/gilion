/**
 * How much of a page type is already sold for one date — and whether more fits.
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * ── Why it packs instead of adding up areas ──────────────────────────────────
 * "The cover is 75% sold" says nothing about whether a half page still fits:
 * two quarters placed side by side leave a half, two placed one above the
 * other may not. The question a seller asks is "can I sell THIS", so it is
 * answered the way the board would answer it — by packing everything already
 * sold, plus the new lines, onto the pages that type has (`autoPlace`, the same
 * packer, held to the same rules). If anything is left over, it does not fit.
 *
 * ── Limited types only ───────────────────────────────────────────────────────
 * Inner pages are not a capacity: auto-placement adds sheets until everything
 * fits. A page type the issue does NOT grow with (the cover, the back) is
 * fixed in number, and that is where a sale can run out of room (the user,
 * 12/10/2026).
 */
import type { DerivedGrid } from "./grid";
import { autoPlace, type AutoPlaceItem, type AutoPlacePage } from "./auto-place";
import type { ShapeSpec } from "./placement";
import type { GridRect } from "./slot-geometry";

/** Where a sale stands. `this` is the order being approved right now. */
export const LOAD_STAGES = ["approved", "pending", "draft", "this"] as const;
export type LoadStage = (typeof LOAD_STAGES)[number];

export type LoadItem = { id: string; shape: ShapeSpec; stage: LoadStage };

export type TypeLoadInput = {
  /** How many pages of this type the issue has (or will open with). */
  pages: number;
  grid: DerivedGrid;
  allowedShapes: ShapeSpec[];
  /** Areas not for sale on every page of this type. */
  reserved: GridRect[];
  items: LoadItem[];
};

export type TypeLoad = {
  pages: number;
  /** Sellable cells across all pages of this type. */
  totalCells: number;
  /** Cells sold, by stage. */
  used: Record<LoadStage, number>;
  /** How many of the counted items found no room when packed together. */
  overflow: number;
};

const cellsOf = (s: ShapeSpec) => s.cols * s.rows;

/**
 * Packs the items of the given stages onto the pages of one type.
 *
 * `stages` decides what counts as taken. Approval asks about approved +
 * pending + this order; the overview counts everything that is not a draft.
 */
export function typeLoad(input: TypeLoadInput, stages: readonly LoadStage[]): TypeLoad {
  const reservedCells = input.reserved.reduce((n, r) => n + r.cols * r.rows, 0);
  const perPage = Math.max(0, input.grid.columns * input.grid.rows - reservedCells);

  const used = Object.fromEntries(LOAD_STAGES.map((s) => [s, 0])) as Record<LoadStage, number>;
  for (const item of input.items) used[item.stage] += cellsOf(item.shape);

  const pages: AutoPlacePage[] = Array.from({ length: input.pages }, (_, i) => ({
    pageId: `p${i}`,
    pageNumber: i + 1,
    allowedShapes: input.allowedShapes,
    occupied: [...input.reserved],
  }));
  const counted: AutoPlaceItem[] = input.items
    .filter((i) => stages.includes(i.stage))
    .map((i) => ({ publicationId: i.id, shape: i.shape }));

  const overflow = counted.length === 0 ? 0 : autoPlace(counted, pages, input.grid).unplaced.length;

  return { pages: input.pages, totalCells: perPage * input.pages, used, overflow };
}

/** Percent of the type that is sold in the given stages, rounded, capped at 100. */
export function percentUsed(load: TypeLoad, stages: readonly LoadStage[]): number {
  if (load.totalCells === 0) return 0;
  const cells = stages.reduce((n, s) => n + load.used[s], 0);
  return Math.min(100, Math.round((cells / load.totalCells) * 100));
}
