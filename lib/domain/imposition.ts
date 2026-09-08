/**
 * Saddle-stitch imposition — the order a press needs, not the order a reader
 * needs (asked for 07/09/2026).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * ── What a newspaper physically is ───────────────────────────────────────────
 * A stack of sheets, each folded once down the middle and stapled through the
 * fold. One sheet therefore carries FOUR pages: two on its outer face and two
 * on its inner face. The cover and the back cover are two halves of the same
 * piece of paper.
 *
 * So the file a press wants is not "page 1, page 2, page 3…". It is one image
 * per printed SIDE, each twice as wide as a page, with two page numbers on it
 * that are nowhere near each other in reading order. For eight pages:
 *
 *     sheet 1 outer:  [ 1 | 8 ]      sheet 1 inner:  [ 7 | 2 ]
 *     sheet 2 outer:  [ 3 | 6 ]      sheet 2 inner:  [ 5 | 4 ]
 *
 * (written left half first, as the flat sheet lies)
 *
 * ── The direction, which is the whole risk ───────────────────────────────────
 * A Hebrew publication is bound on the RIGHT. Fold a sheet and look at its
 * outer face: the front cover's spine edge is its right edge, so the cover sits
 * in the LEFT half of the flat sheet, and the back cover in the right half.
 * That is the mirror of an English booklet, and getting it backwards prints an
 * entire run inside out — which is why the direction is ONE flag in ONE place
 * (`bindOnRight`) rather than an assumption spread through the arithmetic.
 *
 * ── Pages that do not exist ──────────────────────────────────────────────────
 * Stitching needs a multiple of four. The composer enforces it by adding whole
 * sheets, and page removal refuses to break it — but an issue built before that
 * rule, or one a migration touched, still has to produce a file. Missing halves
 * come back as `null` and are printed blank, because a press given five sides
 * and told to work it out is a press that phones you.
 */

/** Pages per physical sheet: two sides, two pages on each. */
export const PAGES_PER_PHYSICAL_SHEET = 4;

export type PrintedSide = {
  /** 1-based, outermost first. Sheet 1 carries the cover. */
  sheet: number;
  /** `outer` carries the cover and the back; `inner` is what is behind them. */
  side: "outer" | "inner";
  /** Page number in the LEFT half of the flat sheet, or null for a blank. */
  left: number | null;
  /** Page number in the RIGHT half, or null for a blank. */
  right: number | null;
};

/** How many sheets a page count needs, rounding up to a whole sheet. */
export function sheetsNeeded(pageCount: number): number {
  return Math.ceil(Math.max(0, pageCount) / PAGES_PER_PHYSICAL_SHEET);
}

/** True when this page count can actually be folded and stapled. */
export function isStitchable(pageCount: number): boolean {
  return pageCount > 0 && pageCount % PAGES_PER_PHYSICAL_SHEET === 0;
}

/**
 * The printed sides, in the order they come off the press.
 *
 * `pageCount` is the issue's real page count; anything short of a whole sheet
 * is padded with blanks at the END of the reading order, which is where a
 * printer expects a short run to leave them.
 *
 * The arithmetic in one line: on sheet k the outer face carries the (2k-1)-th
 * page from the front and the (2k-1)-th from the back; the inner face carries
 * the 2k-th from each. Which of the two lands on the left is the only thing
 * `bindOnRight` changes.
 */
export function impose(
  pageCount: number,
  { bindOnRight = true }: { bindOnRight?: boolean } = {},
): PrintedSide[] {
  const sheets = sheetsNeeded(pageCount);
  if (sheets === 0) return [];

  // The count the arithmetic works in — real pages plus the blanks that make up
  // the last sheet.
  const total = sheets * PAGES_PER_PHYSICAL_SHEET;
  const real = (n: number): number | null => (n >= 1 && n <= pageCount ? n : null);

  const sides: PrintedSide[] = [];
  for (let k = 1; k <= sheets; k++) {
    const frontOuter = 2 * k - 1; // 1, 3, 5 … counting in from the front
    const backOuter = total - (2 * k - 2); // N, N-2, N-4 … counting in from the back
    const frontInner = 2 * k; // 2, 4, 6 …
    const backInner = total - (2 * k - 1); // N-1, N-3, N-5 …

    sides.push({
      sheet: k,
      side: "outer",
      // Bound on the right: the earlier page's spine edge is on ITS right, so
      // it lies in the left half. Bound on the left, the two swap.
      left: real(bindOnRight ? frontOuter : backOuter),
      right: real(bindOnRight ? backOuter : frontOuter),
    });
    sides.push({
      sheet: k,
      side: "inner",
      // The inner face is the outer face turned over, so the halves swap again.
      left: real(bindOnRight ? backInner : frontInner),
      right: real(bindOnRight ? frontInner : backInner),
    });
  }

  return sides;
}

/** Every page that appears on a printed side, for a completeness check. */
export function pagesOn(sides: readonly PrintedSide[]): number[] {
  return sides
    .flatMap((s) => [s.left, s.right])
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);
}

/**
 * The slug printed on a press sheet — and the one line that stops a run being
 * set backwards.
 *
 * It names the halves EXPLICITLY rather than leaving the folios to speak,
 * because on a sheet whose pages are mostly empty the folios are two grey
 * digits and nothing else, and because the last clause is the one a person
 * actually needs: an outer sheet reads "1 … 4" left to right, which to a Hebrew
 * reader looks backwards every single time. It is not backwards — imposition
 * order is not reading order — but a sheet that does not SAY so gets reported
 * as a bug, or worse, "corrected" at the print shop.
 *
 *   דף 1 · צד חיצוני · שמאל: עמוד 1 · ימין: עמוד 4 · סדר קיפול, לא סדר קריאה
 *
 * Kept to one short line because a press sheet is cut to trim size: it has no
 * slug area, so every character here is ink on the product. The renderer puts
 * it on the fold, which is the gutter, which is where it costs least.
 */
export function sideLabel(side: PrintedSide): string {
  const half = (page: number | null) => (page === null ? "ריק" : `עמוד ${page}`);

  return [
    `דף ${side.sheet}`,
    side.side === "outer" ? "צד חיצוני" : "צד פנימי",
    `שמאל: ${half(side.left)}`,
    `ימין: ${half(side.right)}`,
    "סדר קיפול, לא סדר קריאה",
  ].join(" · ");
}
