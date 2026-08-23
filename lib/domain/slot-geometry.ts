/**
 * Slot geometry on a template page (FR-14, US-006).
 *
 * All coordinates are PERCENTAGES of the page (0-100), never millimetres. The
 * ERD leaves units open and the Stitch mockups showed invented mm figures
 * (docs/design/gaps.md §א). Percentages keep a template valid when the
 * newspaper's page_size changes; the conversion to mm happens once, at PDF
 * generation, against the size actually in force.
 *
 * Stage 06 reuses this module for placement, so the same overlap rule governs
 * both designing a template and filling an issue.
 */

export type Rect = { x: number; y: number; width: number; height: number };

export const PAGE_MIN = 0;
export const PAGE_MAX = 100;
/** The editor snaps to this grid, so equality comparisons are exact. */
export const GRID = 5;

export type GeometryError =
  | { kind: "out_of_bounds"; message: string }
  | { kind: "non_positive"; message: string }
  | { kind: "overlap"; message: string; withIndex: number };

/** Rounds to the snap grid, keeping the value inside the page. */
export function snap(value: number): number {
  return Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.round(value / GRID) * GRID));
}

export function validateRect(rect: Rect): GeometryError | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return { kind: "non_positive", message: "לסלוט חייבים להיות רוחב וגובה גדולים מאפס" };
  }
  if (rect.x < PAGE_MIN || rect.y < PAGE_MIN) {
    return { kind: "out_of_bounds", message: "הסלוט חורג מגבולות העמוד" };
  }
  if (rect.x + rect.width > PAGE_MAX || rect.y + rect.height > PAGE_MAX) {
    return { kind: "out_of_bounds", message: "הסלוט חורג מגבולות העמוד" };
  }
  return null;
}

/**
 * True when two rectangles share any area.
 *
 * Touching edges are allowed: two slots side by side at x=0..50 and x=50..100
 * are a normal layout, not a conflict. The comparison is therefore strict —
 * an overlap needs actual positive area in common.
 */
export function overlaps(a: Rect, b: Rect): boolean {
  const separated =
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  return !separated;
}

/** Area shared by two rectangles, as a percentage of the page. */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Validates one slot against the page and against its siblings.
 * `others` must exclude the slot being edited.
 */
export function validateSlot(rect: Rect, others: Rect[]): GeometryError | null {
  const bounds = validateRect(rect);
  if (bounds) return bounds;

  for (const [index, other] of others.entries()) {
    if (overlaps(rect, other)) {
      return {
        kind: "overlap",
        message: "הסלוט חופף לסלוט אחר באותו עמוד",
        withIndex: index,
      };
    }
  }
  return null;
}

/** Every overlapping pair on a page — what the editor highlights in red. */
export function findOverlappingPairs(rects: Rect[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (overlaps(rects[i]!, rects[j]!)) pairs.push([i, j]);
    }
  }
  return pairs;
}

/** Percentage of the page covered by slots — shown as page fill in the editor. */
export function coverage(rects: Rect[]): number {
  return rects.reduce((sum, r) => sum + r.width * r.height, 0) / 100;
}

/** Converts a percentage rect to millimetres for PDF output (stage 07). */
export function toMillimetres(rect: Rect, pageWidthMm: number, pageHeightMm: number): Rect {
  return {
    x: (rect.x / 100) * pageWidthMm,
    y: (rect.y / 100) * pageHeightMm,
    width: (rect.width / 100) * pageWidthMm,
    height: (rect.height / 100) * pageHeightMm,
  };
}
