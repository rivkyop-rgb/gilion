import { describe, expect, it } from "vitest";

import { buildPrintHtml, type PrintModel, type PrintPage } from "./print-html";
import { deriveGrid, type DerivedGrid } from "@/lib/domain/grid";
import { toMillimetres } from "@/lib/domain/slot-geometry";

/**
 * The printed document, asserted without launching a browser.
 *
 * Two things are worth guarding here and neither needs Chromium: that the pages
 * come out in `page_number` order whatever order they arrive in, and that the
 * page geometry in the markup is the geometry `toMillimetres` produced — which
 * is the one place the RTL mirror happens (conventions.md §1).
 */

/** 200 x 300 mm, 10 mm margin, 4 columns of 45 mm, rows of 20 mm, no gutter. */
const grid: DerivedGrid = deriveGrid({
  pageSize: "custom",
  customWidthMm: 200,
  customHeightMm: 300,
  marginMm: 10,
  columns: 4,
  rowHeightMm: 20,
  gutterMm: 0,
})!;

const page = (number: number, over: Partial<PrintPage> = {}): PrintPage => ({
  number,
  pageTypeName: "פנימי",
  placements: [],
  reserved: [],
  ...over,
});

const model = (pages: PrintPage[], draft = false): PrintModel => ({
  newspaperName: "השבועון",
  issueDate: "15.06.2027",
  grid,
  pages,
  draft,
});

const pageOrder = (html: string) =>
  [...html.matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]));

describe("page order", () => {
  it("prints ascending page_number however the rows arrive", () => {
    // Exactly what a plain findMany returns after a page was inserted in the
    // middle of an issue: creation order, not reading order.
    const html = buildPrintHtml(model([page(3), page(1), page(4), page(2)]));
    expect(pageOrder(html)).toEqual([1, 2, 3, 4]);
  });

  it("emits one section per page and no more", () => {
    const html = buildPrintHtml(model([page(1), page(2), page(3)]));
    expect(pageOrder(html)).toHaveLength(3);
  });

  it("does not renumber — the page keeps the number it was given", () => {
    // An issue whose first page is 5 is not a thing the composer can make, but
    // a report that quietly rewrote page numbers would be worse than one that
    // showed a gap.
    const html = buildPrintHtml(model([page(7), page(5)]));
    expect(pageOrder(html)).toEqual([5, 7]);
  });
});

describe("page geometry", () => {
  it("declares the issue's own trim size with no @page margin", () => {
    const html = buildPrintHtml(model([page(1)]));
    expect(html).toContain("@page { size: 200mm 300mm; margin: 0; }");
  });

  it("positions a placement at exactly the millimetres toMillimetres produced", () => {
    const rect = { col: 0, row: 0, cols: 2, rows: 3 };
    const html = buildPrintHtml(
      model([page(1, { placements: [{ rect, artwork: null, label: "מאפיית לוי" }] })]),
    );

    const box = toMillimetres(rect, grid);
    // col 0 is the RIGHT edge: 200 - 10 - 90 = 100 mm from the physical left.
    expect(box.xMm).toBe(100);
    expect(html).toContain(`left:100mm;top:10mm;width:90mm;height:60mm`);
  });

  it("draws a labelled hole when there is no artwork, rather than nothing", () => {
    const html = buildPrintHtml(
      model([
        page(1, {
          placements: [
            { rect: { col: 0, row: 0, cols: 1, rows: 1 }, artwork: null, label: "פרחי דנה" },
          ],
        }),
      ]),
    );
    expect(html).toContain("box ad empty");
    expect(html).toContain("פרחי דנה");
  });

  it("embeds artwork as the data URI it was handed, and drops the label", () => {
    const html = buildPrintHtml(
      model([
        page(1, {
          placements: [
            {
              rect: { col: 0, row: 0, cols: 1, rows: 1 },
              artwork: "data:image/png;base64,AAAA",
              label: "פרחי דנה",
            },
          ],
        }),
      ]),
    );
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).not.toContain("פרחי דנה");
  });
});

describe("the draft watermark (US-008 AC-3)", () => {
  it("marks every page of a draft", () => {
    const html = buildPrintHtml(model([page(1), page(2)], true));
    expect([...html.matchAll(/draft-mark/g)]).toHaveLength(4); // one CSS rule pair + two pages
    expect(html).toContain("<span>טיוטה</span>");
  });

  it("marks nothing on the final", () => {
    const html = buildPrintHtml(model([page(1), page(2)]));
    expect(html).not.toContain("<span>טיוטה</span>");
  });
});

describe("escaping", () => {
  it("does not let a customer name close a tag", () => {
    const html = buildPrintHtml(
      model([
        page(1, {
          placements: [
            {
              rect: { col: 0, row: 0, cols: 1, rows: 1 },
              artwork: null,
              label: '</div><script>alert("x")</script>',
            },
          ],
        }),
      ]),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
