/**
 * How an issue is READ, as opposed to how it is stored (US-007).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * ── The spread is a view, not a record ───────────────────────────────────────
 * `IssuePage` is one numbered page and stays that way: docs/design/gaps.md §א
 * ruled out storing "page 2-3" as an entity, and stage 07 prints page by page.
 * But nobody lays out a newspaper one page at a time — you lay out the two
 * pages a reader sees at once, because an ad at the inner edge of page 2 sits
 * against whatever is at the inner edge of page 3.
 *
 * So the grouping happens HERE, from the page numbers, and nothing downstream
 * of it knows about spreads. The front cover and the back page have no
 * neighbour — physically, they are the outside of the folded sheet — so they
 * are always alone.
 *
 * ── Which side is which ──────────────────────────────────────────────────────
 * In a right-to-left publication the LOWER page number is on the RIGHT: you
 * open the paper and read rightwards-first. Pages inside a view are therefore
 * kept in ascending order and rendered in DOM order under `dir="rtl"`, which
 * puts the first one on the right with no arithmetic — the same rule the grid
 * itself follows (lib/domain/slot-geometry.ts).
 */
import type { DerivedGrid } from "./grid";
import { occupancyOf, shapesThatFit, type ShapeSpec } from "./placement";
import type { GridRect } from "./slot-geometry";

export type PageRef = {
  id: string;
  number: number;
  pageTypeName: string;
};

export type ViewKind = "cover" | "spread" | "back";

export type IssueView = {
  /** Position in the pager — what "next page" steps through. */
  index: number;
  kind: ViewKind;
  /** Ascending page number; rendered in this order, so [0] lands on the right. */
  pages: PageRef[];
  /** "שער" · "עמודים 2-3" · "גב" */
  label: string;
};

/** How many pages a new issue opens with: cover, one inner spread, back. */
export const DEFAULT_ISSUE_PAGES = 4;

/**
 * Groups an issue's pages into what a person actually looks at.
 *
 * Two pages is a cover and a back and nothing between them — not a spread:
 * they are opposite faces of one sheet and are never seen together.
 */
export function viewsOf(pages: readonly PageRef[]): IssueView[] {
  const ordered = [...pages].sort((a, b) => a.number - b.number);
  if (ordered.length === 0) return [];

  const views: IssueView[] = [];
  const push = (kind: ViewKind, group: PageRef[]) =>
    views.push({ index: views.length, kind, pages: group, label: labelFor(kind, group) });

  push("cover", [ordered[0]!]);
  if (ordered.length === 1) return views;

  const middle = ordered.slice(1, -1);
  for (let i = 0; i < middle.length; i += 2) {
    push("spread", middle.slice(i, i + 2));
  }

  push("back", [ordered[ordered.length - 1]!]);
  return views;
}

function labelFor(kind: ViewKind, pages: PageRef[]): string {
  if (kind === "cover") return "שער";
  if (kind === "back") return "גב";
  if (pages.length === 2) return `עמודים ${pages[0]!.number}-${pages[1]!.number}`;
  return `עמוד ${pages[0]?.number ?? ""}`;
}

/**
 * How many pages one "add" adds: a sheet, not a side.
 *
 * Inner pages do not exist singly. A sheet of newsprint folded into the issue
 * carries two inner sides, and adding one of them is not something a printer
 * can do — an issue with an odd inner count has a blank half nobody ordered.
 * So the seam adds a pair, and the arithmetic stays what a print shop would
 * recognise.
 */
export const PAGES_PER_SHEET = 2;

/**
 * What to call a page when speaking to a person.
 *
 * "Page 1" and "page 12" are not the same kind of fact. The first and the last
 * page of an issue have NAMES — they are the outside of the folded sheet, they
 * are priced differently and they are sold differently — and a seller asked
 * "which pages still have room" wants to hear "the cover", not a number they
 * then have to work out is the cover.
 */
export function pageLabel(pageNumber: number, totalPages: number): string {
  if (pageNumber === 1) return "שער";
  if (totalPages > 1 && pageNumber === totalPages) return "גב";
  return `עמוד ${pageNumber}`;
}

/** Which view a page is on — how "jump to that page" finds its way. */
export function viewIndexOfPage(views: readonly IssueView[], pageId: string): number {
  return views.findIndex((v) => v.pages.some((p) => p.id === pageId));
}

/**
 * The seams a new page can be inserted at.
 *
 * A seam is named by the page number it would become. The cover keeps its
 * place — a new page can go after it but never before it — and a page inserted
 * at the very end lands before the back page, not after it, because the back
 * page is the outside of the sheet and cannot stop being last.
 */
export function seamsOf(pages: readonly PageRef[]): Array<{ afterPageId: string; label: string }> {
  const ordered = [...pages].sort((a, b) => a.number - b.number);
  // With fewer than two pages there is no "inside" yet; the caller offers a
  // plain "add page" instead.
  if (ordered.length < 2) return [];

  // Every position except after the last page: the back stays the back.
  return ordered.slice(0, -1).map((page) => ({
    afterPageId: page.id,
    label: `הוספת עמוד אחרי עמוד ${page.number}`,
  }));
}

/**
 * The four page types a new issue opens with: cover, two inner, back.
 *
 * Page types are free text owned by each newspaper (US-006), so there is no
 * flag saying "this one is the cover" — and there should not be one: which
 * page is the cover is decided by POSITION, because in a printed newspaper the
 * cover simply is page 1. What the names are good for is a sensible first
 * guess, which is all this is. Every row stays editable in the form.
 */
export function defaultPageTypeIds(
  pageTypes: ReadonlyArray<{ id: string; name: string }>,
  pageCount = DEFAULT_ISSUE_PAGES,
): string[] {
  if (pageTypes.length === 0) return [];

  const byName = (needle: string) => pageTypes.find((t) => t.name.includes(needle));
  const fallback = pageTypes[0]!;
  const cover = byName("שער") ?? fallback;
  const back = byName("גב") ?? fallback;
  // Anything that is not one of the two outsides is an ordinary inner page.
  const inner = pageTypes.find((t) => t.id !== cover.id && t.id !== back.id) ?? fallback;

  const ids: string[] = [];
  for (let i = 0; i < Math.max(1, pageCount); i++) {
    if (i === 0) ids.push(cover.id);
    else if (i === pageCount - 1) ids.push(back.id);
    else ids.push(inner.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// How full a page is, and what is still sellable on it
// ---------------------------------------------------------------------------

export type PageFill = {
  pageId: string;
  pageNumber: number;
  usedCells: number;
  totalCells: number;
  /** 0-100, for the meter. */
  percent: number;
  /** Shapes the page type allows that still have somewhere to go. */
  fits: ShapeSpec[];
  /** Nothing more can be sold here. */
  full: boolean;
};

/**
 * What a seller needs to know about one page: how much of it is gone, and
 * which of the shapes it accepts can still be sold into what is left.
 *
 * The second half is the useful one. "40% free" is not an offer anyone can
 * make; "a quarter page and an eighth still fit" is.
 */
export function pageFill(
  page: PageRef,
  placed: readonly GridRect[],
  grid: DerivedGrid,
  allowedShapes: readonly ShapeSpec[],
  /**
   * Areas of the page that are not for sale (backlog item 14). They block like
   * a placement but they are not one, so they come off the DENOMINATOR rather
   * than adding to the numerator: "70% מלא" means 70% of what can be sold.
   */
  reserved: readonly GridRect[] = [],
): PageFill {
  const reservedCells = reserved.reduce((sum, r) => sum + r.cols * r.rows, 0);
  const totalCells = Math.max(0, grid.columns * grid.rows - reservedCells);
  const usedCells = placed.reduce((sum, r) => sum + r.cols * r.rows, 0);
  const occupied = occupancyOf([...placed, ...reserved], grid);
  const fits = shapesThatFit(occupied, grid, allowedShapes);

  return {
    pageId: page.id,
    pageNumber: page.number,
    usedCells,
    totalCells,
    percent: totalCells > 0 ? Math.round((usedCells / totalCells) * 100) : 0,
    fits,
    // A page with no shape left to sell is finished, whether or not a cell
    // happens to be free — free space nobody can buy is not capacity.
    full: fits.length === 0,
  };
}

/** The pages still worth selling into, in reading order. */
export function unfinishedPages(fills: readonly PageFill[]): PageFill[] {
  return fills.filter((f) => !f.full).sort((a, b) => a.pageNumber - b.pageNumber);
}
