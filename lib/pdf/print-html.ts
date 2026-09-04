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
 * `Newspaper.logo_url` and `Newspaper.fixed_banner_url` are deliberately absent.
 * Neither carries any geometry, so drawing them would mean this file inventing
 * a position — and the model already has the mechanism for "an image that
 * always sits here on this kind of page": a reserved area, which has a
 * rectangle AND an asset, and which the issue snapshots page by page. Stage 07's
 * plan text predates that feature (backlog item 14) and is superseded by it.
 */
import type { DerivedGrid } from "@/lib/domain/grid";
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

  return `<!doctype html>
<html lang="he" dir="ltr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(model.newspaperName)} — ${escapeHtml(model.issueDate)}</title>
<style>
  @page { size: ${mm(grid.pageWidthMm)} ${mm(grid.pageHeightMm)}; margin: 0; }
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
    inline-size: ${mm(grid.pageWidthMm)};
    block-size: ${mm(grid.pageHeightMm)};
    overflow: hidden;
    break-after: page;
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
  .folio {
    position: absolute;
    inset-block-end: ${mm(Math.max(grid.marginMm / 2, 2))};
    inset-inline: 0;
    text-align: center;
    font-size: 3mm;
    color: #666;
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
${pages.map((page) => renderPage(page, grid, model)).join("\n")}
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
<div class="folio">${page.number}</div>
${model.draft ? `<div class="draft-mark"><span>טיוטה</span></div>` : ""}
</section>`;
}

function renderBox(box: PrintBox, grid: DerivedGrid, kind: "ad" | "reserved"): string {
  const { xMm, yMm, widthMm, heightMm } = toMillimetres(box.rect, grid);
  const style = `left:${mm(xMm)};top:${mm(yMm)};width:${mm(widthMm)};height:${mm(heightMm)}`;

  return box.artwork
    ? `<div class="box ${kind}" style="${style}"><img src="${box.artwork}" alt=""></div>`
    : `<div class="box ${kind} empty" style="${style}">${escapeHtml(box.label)}</div>`;
}
