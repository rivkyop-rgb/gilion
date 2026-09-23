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

/**
 * The press layout: one PDF page per printed SIDE, two issue pages on it.
 *
 * The arithmetic that decides which page lands where is asserted in
 * lib/domain/imposition.test.ts. What is asserted here is the half of it this
 * file owns — that the sheet is twice as wide, that the right-hand page's boxes
 * are pushed across by exactly one page width, and that nothing else about a
 * placement moves.
 */
describe("the press sheet", () => {
  const withAd = (n: number): PrintPage =>
    page(n, {
      placements: [
        { rect: { col: 0, row: 0, cols: 2, rows: 3 }, artwork: null, label: `מודעה ${n}` },
      ],
    });

  const pressHtml = (count: number) =>
    buildPrintHtml({
      ...model(Array.from({ length: count }, (_, i) => withAd(i + 1))),
      layout: "press",
    });

  it("is twice as wide as a page, and the same height", () => {
    expect(pressHtml(4)).toContain("@page { size: 400mm 300mm; margin: 0; }");
  });

  it("prints one side per face, not one per page", () => {
    const html = pressHtml(8);
    expect([...html.matchAll(/data-sheet="/g)]).toHaveLength(4);
    expect(html).not.toContain('data-page="');
  });

  it("puts the cover and the back on the same sheet, cover on the left", () => {
    const html = pressHtml(4);
    expect(html).toContain('data-sheet="1" data-side="outer" data-left="1" data-right="4"');
    expect(html).toContain('data-sheet="1" data-side="inner" data-left="3" data-right="2"');
  });

  it("offsets the right-hand page by exactly one page width and nothing else", () => {
    const rect = { col: 0, row: 0, cols: 2, rows: 3 };
    const box = toMillimetres(rect, grid);
    // col 0 is the RIGHT edge: 200 - 10 - 90 = 100 mm from the page's own left.
    expect(box.xMm).toBe(100);

    const html = pressHtml(4);
    // Page 1 is the left half — untouched.
    expect(html).toContain(`left:100mm;top:10mm;width:90mm;height:60mm`);
    // Page 4 is the right half — pushed across by one page width, 200 mm.
    expect(html).toContain(`left:300mm;top:10mm;width:90mm;height:60mm`);
  });

  it("marks the fold and names the side, so nobody measures", () => {
    const html = pressHtml(4);
    expect(html).toContain('class="fold"');
    expect(html).toContain("דף 1 · צד חיצוני");
    expect(html).toContain("דף 1 · צד פנימי");
  });

  it("leaves a half blank when the count does not fold", () => {
    // Six pages print as eight; the two missing halves are on the outer sheet.
    const html = pressHtml(6);
    expect(html).toContain('data-left="1" data-right=""');
    expect(html).toContain('data-left="" data-right="2"');
  });

  it("still watermarks a draft, on every side", () => {
    const html = buildPrintHtml({
      ...model([withAd(1), withAd(2), withAd(3), withAd(4)]),
      layout: "press",
      draft: true,
    });
    expect([...html.matchAll(/<span>טיוטה<\/span>/g)]).toHaveLength(2);
  });

  it("is not what the reader layout produces", () => {
    const reader = buildPrintHtml(model([withAd(1), withAd(2), withAd(3), withAd(4)]));
    expect(reader).toContain("@page { size: 200mm 300mm; margin: 0; }");
    expect([...reader.matchAll(/data-page="/g)]).toHaveLength(4);
    expect(reader).not.toContain('class="fold"');
  });
});

/**
 * The business's footer line (stage 11's `pdf_footer`).
 *
 * It was a field in the admin panel that described exactly where it would
 * appear — "at the foot of every page of the press file" — and reached nothing
 * at all until 23/09/2026. Empty stays empty: this is ink on a finished
 * newspaper page, so nothing is printed that nobody asked for.
 */
describe("the business footer line", () => {
  it("prints nothing at all when the business has not set one", () => {
    const html = buildPrintHtml(model([page(1), page(2)]));
    // The class is always in the stylesheet; what must be absent is an element
    // wearing it.
    expect(html).not.toContain('class="page-footer"');
  });

  it("appears once per page when it is set", () => {
    const html = buildPrintHtml({
      ...model([page(1), page(2)]),
      footer: "הוצאת המרכז · 03-1234567",
    });
    expect(html.match(/class="page-footer"/g)).toHaveLength(2);
    expect(html).toContain("הוצאת המרכז · 03-1234567");
  });

  it("appears once per PAGE on a press sheet, not once per sheet", () => {
    // A press side carries two folios, so it carries two footers — the same
    // rule the page number follows.
    const html = buildPrintHtml({
      ...model([page(1), page(2), page(3), page(4)], false),
      layout: "press",
      footer: "קו תחתון",
    });
    expect(html.match(/class="page-footer"/g)).toHaveLength(4);
  });

  it("escapes what the admin typed", () => {
    const html = buildPrintHtml({ ...model([page(1)]), footer: "<script>x</script>" });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
