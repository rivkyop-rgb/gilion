/**
 * Filling an issue by itself (backlog item 4).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * ── The decision that made this tractable ────────────────────────────────────
 * `prd.md` left automatic placement out of the MVP, and the reason it is hard
 * is not the geometry — it is that a packer which runs out of room has to
 * decide WHICH ads to leave out, and no algorithm has any basis for that.
 *
 * The answer given was: the issue GROWS. "The system should add as many pages
 * as it needs to place all the publications." So there is no failure mode to
 * design, only a page count to report — and the whole problem collapses into
 * ordinary first-fit packing.
 *
 * ── Deterministic, with a seed ───────────────────────────────────────────────
 * The same input gives the same layout, every time. Real randomness would make
 * "try again" a way to lose an arrangement you liked, and would make every test
 * of this file worthless. A different arrangement is asked for explicitly, by
 * passing a different seed, and that seed is what makes it reproducible.
 *
 * ── Rule 7א still applies ────────────────────────────────────────────────────
 * A placement that would strand space no shape can be sold into is refused here
 * exactly as it is refused by hand. The packer is not exempt from it; it is
 * merely free to open another sheet instead of giving up.
 */
import type { DerivedGrid } from "./grid";
import { deadSpaceCreatedBy, occupancyOf, type ShapeSpec } from "./placement";
import { positionAllowed, type GridRect } from "./slot-geometry";

/** One publication waiting for a home. */
export type AutoPlaceItem = {
  publicationId: string;
  shape: ShapeSpec;
  /**
   * The page type the customer BOUGHT (AdOrderItem.page_type_id) — the price
   * was set by it, so the packer is bound by it. A half page sold at the cover
   * price lands on the cover or nowhere. Null only for a publication with no
   * order line behind it; that one may go on any page open to auto-placement.
   */
  pageTypeId?: string | null;
  /**
   * A page NUMBER the order (or the customer) asked for (the user,
   * 31/10/2026). Tried first; when that page cannot take it, the ad goes on
   * the next page that can rather than staying out of the issue.
   */
  requestedPage?: number | null;
};

/** A page the packer may use, in the order it appears in the issue. */
export type AutoPlacePage = {
  pageId: string;
  pageNumber: number;
  pageTypeId?: string;
  /**
   * The newspaper's setting (PageType.auto_place): may auto-placement put an
   * ad here that was not sold for this type? The cover and the back are
   * usually closed — but an ad SOLD for the cover still goes on the cover.
   */
  openToAny?: boolean;
  /** Shapes this page type accepts (FR-14). */
  allowedShapes: ShapeSpec[];
  /** Rectangles already on it — auto-placement never moves existing ads. */
  occupied: GridRect[];
};

export type AutoPlacement = {
  publicationId: string;
  pageId: string;
  col: number;
  row: number;
};

export type AutoPlaceResult = {
  placements: AutoPlacement[];
  /**
   * Publications that fit on no EXISTING page — the caller adds sheets for
   * them and runs again. Empty once the issue is big enough.
   */
  unplaced: AutoPlaceItem[];
};

/**
 * A tiny deterministic generator.
 *
 * Not `Math.random()`: the same seed has to produce the same issue, or "try
 * another arrangement" becomes a one-way door and no test can assert anything.
 * Mulberry32 — small, well-distributed enough to shuffle a few dozen ads.
 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, driven by the seeded generator. */
function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Where a shape may go on a page, given what is already there.
 *
 * Walks in reading order, which is what makes the result look deliberate
 * rather than scattered: ads settle towards the top-start corner and the page
 * fills the way a person would fill it.
 */
export function firstFit(
  shape: ShapeSpec,
  page: AutoPlacePage,
  grid: DerivedGrid,
  taken: GridRect[],
): GridRect | null {
  const occupied = occupancyOf(taken, grid);

  for (let row = 0; row + shape.rows <= grid.rows; row++) {
    for (let col = 0; col + shape.cols <= grid.columns; col++) {
      const rect: GridRect = { col, row, cols: shape.cols, rows: shape.rows };
      if (!positionAllowed(rect, shape.positions)) continue;

      // Free? Checked against the occupancy map rather than pairwise, so a
      // page with twenty ads on it costs the same as one with two.
      let free = true;
      for (let r = rect.row; r < rect.row + rect.rows && free; r++) {
        for (let c = rect.col; c < rect.col + rect.cols; c++) {
          if (occupied[r * grid.columns + c] === 1) {
            free = false;
            break;
          }
        }
      }
      if (!free) continue;

      // The same rule a person is held to: no stranded, unsellable remainder.
      if (deadSpaceCreatedBy(rect, taken, grid, page.allowedShapes)) continue;

      return rect;
    }
  }
  return null;
}

/**
 * Places what it can on the pages it is given.
 *
 * Largest first, because a full page dropped into a half-filled sheet has
 * nowhere to go while an eighth always does — packing big to small is what
 * stops the last few ads being the ones that never fit. The seed only reorders
 * items of the SAME footprint, so "another arrangement" varies which customer
 * lands where without making the layout worse.
 */
export function autoPlace(
  items: readonly AutoPlaceItem[],
  pages: readonly AutoPlacePage[],
  grid: DerivedGrid,
  seed = 1,
): AutoPlaceResult {
  const next = rng(seed);

  // Group by footprint, shuffle within each group, then walk the groups from
  // largest area to smallest.
  const byFootprint = new Map<string, AutoPlaceItem[]>();
  for (const item of items) {
    const key = `${item.shape.cols}x${item.shape.rows}`;
    byFootprint.set(key, [...(byFootprint.get(key) ?? []), item]);
  }
  const ordered = [...byFootprint.entries()]
    .sort((a, b) => {
      const [ac, ar] = a[0].split("x").map(Number);
      const [bc, br] = b[0].split("x").map(Number);
      return bc! * br! - ac! * ar!;
    })
    .flatMap(([, group]) => shuffled(group, next))
    // Ads that asked for a page go first, so a page is not filled by somebody
    // who did not ask for it before the one who did gets there. Stable, so the
    // footprint order above still holds within each half.
    .sort((a, b) => Number(Boolean(b.requestedPage)) - Number(Boolean(a.requestedPage)));

  const taken = new Map<string, GridRect[]>(pages.map((p) => [p.pageId, [...p.occupied]]));
  const placements: AutoPlacement[] = [];
  const unplaced: AutoPlaceItem[] = [];

  for (const item of ordered) {
    let landed = false;

    const order = item.requestedPage
      ? [
          ...pages.filter((p) => p.pageNumber === item.requestedPage),
          ...pages.filter((p) => p.pageNumber !== item.requestedPage),
        ]
      : pages;
    for (const page of order) {
      if (!pageAccepts(page, item)) continue;
      // FR-14: the page type has to accept the shape at all.
      if (!page.allowedShapes.some((s) => s.id === item.shape.id)) continue;

      const rect = firstFit(item.shape, page, grid, taken.get(page.pageId)!);
      if (!rect) continue;

      taken.get(page.pageId)!.push(rect);
      placements.push({
        publicationId: item.publicationId,
        pageId: page.pageId,
        col: rect.col,
        row: rect.row,
      });
      landed = true;
      break;
    }

    if (!landed) unplaced.push(item);
  }

  return { placements, unplaced };
}

/** The page type it was sold for, or — when none is recorded — any open page. */
export function pageAccepts(page: AutoPlacePage, item: AutoPlaceItem): boolean {
  if (item.pageTypeId) return page.pageTypeId === item.pageTypeId;
  return page.openToAny !== false;
}

/**
 * How many extra sheets the leftovers need, at minimum.
 *
 * A lower bound from area alone, and deliberately so: it is used to decide how
 * many pages to add before packing again, and packing again is what determines
 * the truth. Guessing high would leave blank pages nobody ordered.
 */
export function sheetsNeededFor(
  items: readonly AutoPlaceItem[],
  grid: DerivedGrid,
  pagesPerSheet = 2,
): number {
  if (items.length === 0) return 0;
  const cellsPerPage = grid.columns * grid.rows;
  if (cellsPerPage <= 0) return 0;

  const cells = items.reduce((sum, i) => sum + i.shape.cols * i.shape.rows, 0);
  return Math.max(1, Math.ceil(cells / cellsPerPage / pagesPerSheet));
}

/**
 * The biggest shape this page still has room for, with where it would go —
 * what "free space" means to somebody selling it (the user, 01/11/2026: show
 * the free space and its price). Same rules as auto-placement: allowed
 * region, nothing overlapping, and no stranded remainder (7א).
 */
export function largestThatFits(
  page: AutoPlacePage,
  grid: DerivedGrid,
): { shape: ShapeSpec; rect: GridRect } | null {
  const bySize = [...page.allowedShapes].sort((a, b) => b.cols * b.rows - a.cols * a.rows);
  for (const shape of bySize) {
    const rect = firstFit(shape, page, grid, page.occupied);
    if (rect) return { shape, rect };
  }
  return null;
}
