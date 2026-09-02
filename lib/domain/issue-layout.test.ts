import { describe, expect, it } from "vitest";

import { deriveGrid, type DerivedGrid } from "./grid";
import {
  defaultPageTypeIds,
  pageFill,
  pageLabel,
  seamsOf,
  unfinishedPages,
  viewIndexOfPage,
  viewsOf,
  type PageRef,
} from "./issue-layout";
import type { ShapeSpec } from "./placement";

const pages = (count: number): PageRef[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    number: i + 1,
    pageTypeName: i === 0 ? "שער" : i === count - 1 ? "גב" : "פנימי",
  }));

describe("grouping pages into what a person looks at", () => {
  it("shows the cover alone, the inner pages in pairs, and the back alone", () => {
    const views = viewsOf(pages(6));

    expect(views.map((v) => v.kind)).toEqual(["cover", "spread", "spread", "back"]);
    expect(views.map((v) => v.label)).toEqual(["שער", "עמודים 2-3", "עמודים 4-5", "גב"]);
    expect(views[1]!.pages.map((p) => p.number)).toEqual([2, 3]);
  });

  it("keeps the lower page number first, which RTL renders on the right", () => {
    const spread = viewsOf(pages(4))[1]!;
    expect(spread.pages[0]!.number).toBe(2);
    expect(spread.pages[1]!.number).toBe(3);
  });

  it("leaves an odd inner page as a half spread rather than pairing it with the back", () => {
    const views = viewsOf(pages(5));
    expect(views.map((v) => v.kind)).toEqual(["cover", "spread", "spread", "back"]);
    expect(views[2]!.pages.map((p) => p.number)).toEqual([4]);
    expect(views[2]!.label).toBe("עמוד 4");
  });

  it("treats two pages as a cover and a back, never as a spread", () => {
    // They are opposite faces of one sheet — nobody ever sees them together.
    expect(viewsOf(pages(2)).map((v) => v.kind)).toEqual(["cover", "back"]);
  });

  it("handles one page and none at all", () => {
    expect(viewsOf(pages(1)).map((v) => v.kind)).toEqual(["cover"]);
    expect(viewsOf([])).toEqual([]);
  });

  it("orders by page number, not by the order it was handed", () => {
    const shuffled = [pages(4)[2]!, pages(4)[0]!, pages(4)[3]!, pages(4)[1]!];
    expect(viewsOf(shuffled).map((v) => v.pages.map((p) => p.number))).toEqual([[1], [2, 3], [4]]);
  });

  it("finds which view a page is on", () => {
    const views = viewsOf(pages(6));
    expect(viewIndexOfPage(views, "p1")).toBe(0);
    expect(viewIndexOfPage(views, "p3")).toBe(1);
    expect(viewIndexOfPage(views, "p6")).toBe(3);
    expect(viewIndexOfPage(views, "nope")).toBe(-1);
  });
});

describe("where a new page may be inserted", () => {
  it("offers every seam except after the back page", () => {
    // The back is the outside of the folded sheet; it cannot stop being last.
    expect(seamsOf(pages(4)).map((s) => s.afterPageId)).toEqual(["p1", "p2", "p3"]);
  });

  it("offers nothing while there is not yet an inside", () => {
    expect(seamsOf(pages(1))).toEqual([]);
    expect(seamsOf([])).toEqual([]);
  });
});

describe("how full a page is", () => {
  const grid: DerivedGrid = deriveGrid({
    pageSize: "custom",
    customWidthMm: 180,
    customHeightMm: 180,
    marginMm: 10,
    columns: 8,
    rowHeightMm: 20,
    gutterMm: 0,
  })!;

  const quarter: ShapeSpec = { id: "q", name: "רבע עמוד", cols: 4, rows: 4, positions: null };
  const eighth: ShapeSpec = { id: "e", name: "שמינית", cols: 4, rows: 2, positions: null };
  const strip: ShapeSpec = {
    id: "s",
    name: "רצועה תחתונה",
    cols: 8,
    rows: 2,
    positions: [[0, 6]],
  };
  const page = pages(3)[1]!;

  it("reports an empty page as fully sellable", () => {
    const fill = pageFill(page, [], grid, [quarter, eighth, strip]);
    expect(fill.percent).toBe(0);
    expect(fill.full).toBe(false);
    expect(fill.fits.map((s) => s.id)).toEqual(["q", "e", "s"]);
  });

  it("drops a shape once nothing on the page can hold it", () => {
    // Everything but the bottom two rows is taken. The quarter is four rows
    // tall and has nowhere left; the eighth and the strip both still fit, and
    // the strip only because its one allowed position is exactly there.
    const fill = pageFill(page, [{ col: 0, row: 0, cols: 8, rows: 6 }], grid, [
      quarter,
      eighth,
      strip,
    ]);
    expect(fill.fits.map((s) => s.id)).toEqual(["e", "s"]);
    expect(fill.percent).toBe(75);
    expect(fill.full).toBe(false);
  });

  it("respects a shape's allowed region rather than only its size", () => {
    // Two free rows at the TOP would hold the strip's footprint, but the strip
    // is only ever allowed against the foot of the page.
    const fill = pageFill(page, [{ col: 0, row: 2, cols: 8, rows: 6 }], grid, [strip]);
    expect(fill.fits).toEqual([]);
    expect(fill.full).toBe(true);
  });

  it("calls a page full when no shape fits, even with cells still free", () => {
    const fill = pageFill(page, [{ col: 0, row: 0, cols: 8, rows: 7 }], grid, [quarter, eighth]);
    expect(fill.usedCells).toBeLessThan(fill.totalCells);
    // Free space nobody can buy is not capacity.
    expect(fill.full).toBe(true);
  });

  it("lists the pages still worth selling into, in reading order", () => {
    const all = [
      pageFill(pages(3)[2]!, [{ col: 0, row: 0, cols: 8, rows: 8 }], grid, [quarter]),
      pageFill(pages(3)[1]!, [], grid, [quarter]),
      pageFill(pages(3)[0]!, [], grid, [quarter]),
    ];
    expect(unfinishedPages(all).map((f) => f.pageNumber)).toEqual([1, 2]);
  });
});

describe("what a new issue opens with", () => {
  const types = [
    { id: "t_cover", name: "שער" },
    { id: "t_inner", name: "עמוד פנימי" },
    { id: "t_back", name: "גב" },
  ];

  it("guesses cover, two inner pages and a back", () => {
    expect(defaultPageTypeIds(types)).toEqual(["t_cover", "t_inner", "t_inner", "t_back"]);
  });

  it("falls back to the first type when the names say nothing", () => {
    const vague = [
      { id: "a", name: "סוג א" },
      { id: "b", name: "סוג ב" },
    ];
    expect(defaultPageTypeIds(vague)).toEqual(["a", "b", "b", "a"]);
  });

  it("survives a newspaper with a single page type", () => {
    expect(defaultPageTypeIds([{ id: "only", name: "רגיל" }])).toEqual([
      "only",
      "only",
      "only",
      "only",
    ]);
  });

  it("has nothing to guess when the newspaper has no page types", () => {
    expect(defaultPageTypeIds([])).toEqual([]);
  });
});

describe("what a page is called", () => {
  it("names the outside pages and numbers the rest", () => {
    expect(pageLabel(1, 6)).toBe("שער");
    expect(pageLabel(6, 6)).toBe("גב");
    expect(pageLabel(3, 6)).toBe("עמוד 3");
  });

  it("calls a lone page the cover, not both at once", () => {
    expect(pageLabel(1, 1)).toBe("שער");
  });
});
