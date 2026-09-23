/**
 * The printed issue, as one HTML document (conventions.md §8, FR-22).
 *
 * A pure string builder: no Prisma, no React, no browser. Everything it needs
 * arrives already resolved — the geometry as millimetres, the artwork as data
 * URIs — which is what lets the page ORDER and the page GEOMETRY be asserted in
 * Vitest without launching Chromium (pdf-page-order.test.ts).
 *
 * ── Millimetres, absolutely positioned, margin zero ──────────────────────────
 * `@page` gets the full trim size and NO margin, and every rectangle is placed
 * at an absolute millimetre offset from the physical top-left corner. The
 * newspaper's margin is already inside those offsets: toMillimetres() adds it
 * once, in the one place a grid cell becomes a millimetre. Declaring it again
 * as a `@page` margin would count it twice and shift every ad on every page
 * inward by exactly the margin — a fault that looks like a rounding error and
 * is a whole centimetre.
 *
 * ── The x axis is mirrored exactly once ──────────────────────────────────────
 * `col = 0` is the RIGHT edge of the page (conventions.md §1), and `xMm` comes
 * back measured from the LEFT because that is what paper is. That mirroring
 * happens inside toMillimetres and nowhere else — this file never reasons about
 * direction, and the document is `dir="ltr"` on purpose so no bidi rule can
 * quietly move a box that was positioned in absolute millimetres.
 *
 * ── What is NOT drawn ────────────────────────────────────────────────────────
 * A newspaper-wide logo or fixed banner. Neither carries any geometry, so
 * drawing one would mean this file inventing a position — and the model already
 * has the mechanism for "an image that always sits here on this kind of page":
 * a reserved area, which has a rectangle AND an asset, and which the issue
 * snapshots page by page. Stage 07's plan text predates that feature (backlog
 * item 14) and is superseded by it. The two columns that carried the older idea
 * — `Newspaper.logo_url` and `fixed_banner_url` — were never written or read by
 * anything and were dropped on 23/09/2026.
 */
import type { DerivedGrid } from "@/lib/domain/grid";
import { impose, sideLabel, type PrintedSide } from "@/lib/domain/imposition";
import { toMillimetres, type GridRect } from "@/lib/domain/slot-geometry";

export type PrintBox = {
  rect: GridRect;
  /** A `data:` URI, or null when there is nothing to draw. */
  artwork: string | null;
  /** Drawn only when `artwork` is null — so a hole in the page has a name. */
  label: string;
};

export type PrintPage = {
  number: number;
  pageTypeName: string;
  placements: PrintBox[];
  reserved: PrintBox[];
};

export type PrintModel = {
  newspaperName: string;
  /** Already formatted for display — this file does no date work. */
  issueDate: string;
  grid: DerivedGrid;
  pages: PrintPage[];
  /** Draws the diagonal "טיוטה" watermark (US-008 AC-3, FR-22). */
  draft: boolean;
  /**
   * The business's own line along the foot of every page — the `pdf_footer`
   * text of the admin panel (stage 11).
   *
   * Empty by default and drawn only when it is not: this is ink on a finished
   * newspaper page, so the product does not put words there that nobody asked
   * for. It sits inside the bottom margin, which is the one band of the sheet
   * the grid never sells — no position is being invented, which is why the
   * newspaper logo is NOT here (see the note at the top of this file).
   *
   * Until 23/09/2026 the field existed in the panel, described itself as
   * appearing "at the foot of every page of the press file", and reached
   * nothing at all.
   */
  footer?: string;
  /**
   * `reader` — one page per sheet of PDF, in reading order. For proofing.
   * `press`  — one printed SIDE per sheet of PDF, twice as wide, two pages on
   *            it, in saddle-stitch order (lib/domain/imposition.ts).
   *
   * Two documents rather than one because they answer different questions. A
   * person checking the issue reads it; a press folds it. Asked for 07/09/2026.
   */
  layout?: "reader" | "press";
};

/** Millimetres, trimmed: `12.5mm`, not `12.500000000000002mm`. */
const mm = (value: number) => `${Number(value.toFixed(3))}mm`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The whole document.
 *
 * Pages are emitted in ascending `page_number` with no gaps and no reordering
 * left to the caller (validation rule 6). A caller that hands them in creation
 * order — which is what a plain `findMany` on IssuePage does when a page has
 * been inserted mid-issue — still gets a correctly ordered newspaper.
 */
export function buildPrintHtml(model: PrintModel): string {
  const { grid } = model;
  const pages = [...model.pages].sort((a, b) => a.number - b.number);
  const press = model.layout === "press";

  // A printed side is two pages wide and the same height. Everything else about
  // the document — the absolute millimetre offsets, the artwork, the watermark
  // — is identical, which is the point of doing this here rather than in a
  // second builder that would drift from this one.
  const sheetWidthMm = press ? grid.pageWidthMm * 2 : grid.pageWidthMm;
  const sides = press ? impose(pages.length) : [];
  const byNumber = new Map(pages.map((p) => [p.number, p]));

  return `<!doctype html>
<html lang="he" dir="ltr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(model.newspaperName)} — ${escapeHtml(model.issueDate)}</title>
<style>
  @page { size: ${mm(sheetWidthMm)} ${mm(grid.pageHeightMm)}; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    /* DejaVu is the one face in the print container with full Hebrew coverage;
       the rest of the stack is for a machine that has more. */
    font-family: "Google Sans", "Noto Sans Hebrew", "DejaVu Sans", sans-serif;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    position: relative;
    inline-size: ${mm(sheetWidthMm)};
    block-size: ${mm(grid.pageHeightMm)};
    overflow: hidden;
    break-after: page;
  }
  /* The fold, drawn faintly down the centre of a press sheet. A folder is set
     by eye against it, and a sheet with no mark on it is a sheet somebody has
     to measure. */
  .fold {
    position: absolute;
    inset-block: 0;
    inset-inline-start: ${mm(grid.pageWidthMm)};
    border-inline-start: 0.2mm dashed #bbb;
  }
  /* On the FOLD, at the foot — not in a corner.
     A press sheet is cut to trim size and has no slug area, so this line is
     ink on the finished product wherever it goes. The fold is the spine: after
     folding and stapling it lands in the gutter, the least-read strip the
     sheet has. Its first home was the top-left corner, which is the head
     margin of the FRONT COVER.
     The rtl direction is set because the label is Hebrew separated by ·, and
     in an ltr document the segments would come out in the wrong order — the
     one place in this file where direction matters, and it is text, not
     geometry. (No backticks in here: the stylesheet is inside a template
     literal and one would end it. Said above, and still true.) */
  .side-label {
    position: absolute;
    inset-block-end: 1mm;
    inset-inline-start: 0;
    inline-size: 100%;
    text-align: center;
    direction: rtl;
    font-size: 2.6mm;
    color: #999;
  }
  .page:last-child { break-after: auto; }
  .box { position: absolute; overflow: hidden; }
  .box img { inline-size: 100%; block-size: 100%; object-fit: contain; display: block; }
  /* A box with no artwork is a hole in the paper, and it has to LOOK like one:
     an invisible empty rectangle is how a missing ad reaches a press. */
  .box.empty {
    border: 0.4mm dashed #999;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2mm;
    font-size: 3.5mm;
    color: #666;
    direction: rtl;
  }
  .reserved.empty { border-style: solid; background: #f2f2f2; }
  /* Positioned per HALF, not per sheet: a press side carries two folios and
     each belongs over its own page. The offset and width are set inline by the
     renderer, so no backticks in here — this whole stylesheet is inside a
     template literal and one would end it. */
  .folio {
    position: absolute;
    bottom: ${mm(Math.max(grid.marginMm / 2, 2))};
    text-align: center;
    font-size: 3mm;
    color: #666;
  }
  /* The business line, inside the bottom margin and ABOVE the folio, so the
     two never sit on each other — on a press sheet the sheet label is down at
     1mm as well. Small and grey: it is a credit, not a headline, and it must
     not compete with an ad somebody paid for. Direction is rtl for the same
     reason as the side label: it is text, not geometry. (No backticks in this
     stylesheet — it is inside a template literal and one would end it.) */
  .page-footer {
    position: absolute;
    bottom: ${mm(Math.max(grid.marginMm / 2, 2) + 3.4)};
    text-align: center;
    direction: rtl;
    font-size: 2.6mm;
    color: #999;
    overflow: hidden;
    white-space: nowrap;
  }
  /* The draft mark sits ABOVE everything and is not a background: a watermark
     an ad can cover is a watermark that stops being on the page that matters. */
  .draft-mark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .draft-mark span {
    transform: rotate(-45deg);
    font-size: ${mm(grid.pageWidthMm / 5)};
    font-weight: 700;
    color: rgba(190, 30, 45, 0.18);
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
</style>
</head>
<body>
${
  press
    ? sides.map((side) => renderSide(side, byNumber, grid, model)).join("\n")
    : pages.map((page) => renderPage(page, grid, model)).join("\n")
}
</body>
</html>`;
}

function renderPage(page: PrintPage, grid: DerivedGrid, model: PrintModel): string {
  // Reserved areas first, so an ad that somehow overlaps one is visible on the
  // proof rather than hidden underneath it.
  const boxes = [
    ...page.reserved.map((box) => renderBox(box, grid, "reserved")),
    ...page.placements.map((box) => renderBox(box, grid, "ad")),
  ];

  return `<section class="page" data-page="${page.number}" data-page-type="${escapeHtml(page.pageTypeName)}">
${boxes.join("\n")}
<div class="folio" style="left:0;width:${mm(grid.pageWidthMm)}">${page.number}</div>
${renderFooter(model, grid, 0)}
${model.draft ? `<div class="draft-mark"><span>טיוטה</span></div>` : ""}
</section>`;
}

/** The business line at the foot of one page, or nothing when unset. */
function renderFooter(model: PrintModel, grid: DerivedGrid, offsetMm: number): string {
  const text = model.footer?.trim();
  if (!text) return "";
  return `<div class="page-footer" style="left:${mm(offsetMm)};width:${mm(grid.pageWidthMm)}">${escapeHtml(text)}</div>`;
}

/**
 * One printed SIDE of one sheet: two pages side by side, ready to fold.
 *
 * The halves are drawn with the SAME box renderer as a reader page, offset by a
 * page width for the right one. Nothing about a placement's geometry changes —
 * an ad is where the designer put it on its page, and the sheet only decides
 * which page sits where on the paper.
 *
 * A half with no page behind it is left blank on purpose: it is the paper the
 * fold produces and nobody ordered anything onto it.
 */
function renderSide(
  side: PrintedSide,
  byNumber: Map<number, PrintPage>,
  grid: DerivedGrid,
  model: PrintModel,
): string {
  const half = (pageNumber: number | null, offsetMm: number) => {
    const page = pageNumber === null ? undefined : byNumber.get(pageNumber);
    if (!page) return "";
    return [
      ...page.reserved.map((box) => renderBox(box, grid, "reserved", offsetMm)),
      ...page.placements.map((box) => renderBox(box, grid, "ad", offsetMm)),
      `<div class="folio" style="left:${mm(offsetMm)};width:${mm(grid.pageWidthMm)}">${page.number}</div>`,
      // Per half, like the folio: the footer belongs to a PAGE, and a press
      // sheet carries two of them. The side label below is the sheet's.
      renderFooter(model, grid, offsetMm),
    ].join("\n");
  };

  return `<section class="page" data-sheet="${side.sheet}" data-side="${side.side}" data-left="${side.left ?? ""}" data-right="${side.right ?? ""}">
${half(side.left, 0)}
${half(side.right, grid.pageWidthMm)}
<div class="fold"></div>
<div class="side-label">${escapeHtml(sideLabel(side))}</div>
${model.draft ? `<div class="draft-mark"><span>טיוטה</span></div>` : ""}
</section>`;
}

function renderBox(
  box: PrintBox,
  grid: DerivedGrid,
  kind: "ad" | "reserved",
  /** Where this page's left edge sits on the sheet. Zero on a reader page. */
  offsetMm = 0,
): string {
  const { xMm, yMm, widthMm, heightMm } = toMillimetres(box.rect, grid);
  const style = `left:${mm(xMm + offsetMm)};top:${mm(yMm)};width:${mm(widthMm)};height:${mm(heightMm)}`;

  return box.artwork
    ? `<div class="box ${kind}" style="${style}"><img src="${box.artwork}" alt=""></div>`
    : `<div class="box ${kind} empty" style="${style}">${escapeHtml(box.label)}</div>`;
}
