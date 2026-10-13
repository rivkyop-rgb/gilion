import { describe, expect, it } from "vitest";

import { deriveGrid, type DerivedGrid } from "./grid";
import { autoPlace, sheetsNeededFor, type AutoPlaceItem, type AutoPlacePage } from "./auto-place";
import { deadSpaceCreatedBy, type ShapeSpec } from "./placement";
import { overlaps, type GridRect } from "./slot-geometry";

/** 8 x 8, no gutter — every assertion below is arithmetic you can do in your head. */
const grid: DerivedGrid = deriveGrid({
  pageSize: "custom",
  customWidthMm: 180,
  customHeightMm: 180,
  marginMm: 10,
  columns: 8,
  rowHeightMm: 20,
  gutterMm: 0,
})!;

const quarter: ShapeSpec = { id: "q", name: "רבע", cols: 4, rows: 4, positions: null };
const eighth: ShapeSpec = { id: "e", name: "שמינית", cols: 4, rows: 2, positions: null };
const full: ShapeSpec = { id: "f", name: "מלא", cols: 8, rows: 8, positions: null };
const strip: ShapeSpec = { id: "s", name: "רצועה", cols: 8, rows: 2, positions: [[0, 6]] };

const page = (n: number, allowed: ShapeSpec[], occupied: GridRect[] = []): AutoPlacePage => ({
  pageId: `p${n}`,
  pageNumber: n,
  allowedShapes: allowed,
  occupied,
});

const items = (shape: ShapeSpec, count: number): AutoPlaceItem[] =>
  Array.from({ length: count }, (_, i) => ({ publicationId: `${shape.id}-${i}`, shape }));

describe("packing a page", () => {
  it("places four quarters on an empty page and nothing overlaps", () => {
    const result = autoPlace(items(quarter, 4), [page(1, [quarter])], grid);

    expect(result.placements).toHaveLength(4);
    expect(result.unplaced).toEqual([]);
    expectNoOverlaps(result.placements.map(toRect(quarter)));
  });

  it("fills towards the top-start corner, so a page looks deliberate", () => {
    // Reading order, which is what a person does — not scattered.
    const result = autoPlace(items(quarter, 1), [page(1, [quarter])], grid);
    expect(result.placements[0]).toMatchObject({ col: 0, row: 0 });
  });

  it("never breaks rule 7א — no stranded, unsellable remainder", () => {
    // Only quarters are sellable, so an ad one column in would leave a column
    // nothing fits. The packer is held to the same rule a person is.
    const result = autoPlace(items(quarter, 3), [page(1, [quarter])], grid);

    const placed = result.placements.map(toRect(quarter));
    for (const [index, rect] of placed.entries()) {
      const siblings = placed.filter((_, i) => i !== index);
      expect(deadSpaceCreatedBy(rect, siblings, grid, [quarter])).toBeNull();
    }
  });

  it("respects a shape's allowed region", () => {
    const result = autoPlace(items(strip, 1), [page(1, [strip, eighth])], grid);
    expect(result.placements[0]).toMatchObject({ col: 0, row: 6 });
  });

  it("leaves existing ads exactly where they are", () => {
    const existing: GridRect = { col: 0, row: 0, cols: 4, rows: 4 };
    const result = autoPlace(items(quarter, 1), [page(1, [quarter], [existing])], grid);

    expect(result.placements).toHaveLength(1);
    expect(overlaps(toRect(quarter)(result.placements[0]!), existing)).toBe(false);
  });
});

describe("which page an ad lands on", () => {
  it("skips a page whose type does not accept the shape (FR-14)", () => {
    const result = autoPlace(items(full, 1), [page(1, [quarter]), page(2, [full])], grid);
    expect(result.placements[0]?.pageId).toBe("p2");
  });

  it("reports what fits on no existing page, rather than dropping it", () => {
    // Two full pages, one page. The second has nowhere to go — and the caller
    // is expected to add a sheet and run again.
    const result = autoPlace(items(full, 2), [page(1, [full])], grid);

    expect(result.placements).toHaveLength(1);
    expect(result.unplaced).toHaveLength(1);
  });

  it("packs large before small, so the last few are not the ones that never fit", () => {
    const mixed = [...items(eighth, 2), ...items(full, 1)];
    const result = autoPlace(mixed, [page(1, [full, eighth]), page(2, [full, eighth])], grid);

    // The full page got a page to itself; the eighths shared the other.
    const fullPlacement = result.placements.find((p) => p.publicationId.startsWith("f-"));
    const eighths = result.placements.filter((p) => p.publicationId.startsWith("e-"));
    expect(fullPlacement).toBeDefined();
    expect(eighths).toHaveLength(2);
    expect(eighths.every((e) => e.pageId !== fullPlacement!.pageId)).toBe(true);
  });
});

describe("the same input gives the same issue", () => {
  it("is deterministic for one seed", () => {
    const once = autoPlace(items(quarter, 4), [page(1, [quarter])], grid, 7);
    const twice = autoPlace(items(quarter, 4), [page(1, [quarter])], grid, 7);
    expect(twice).toEqual(once);
  });

  it("gives a different arrangement for a different seed", () => {
    // "Another arrangement" has to be asked for, and asking twice for the same
    // one has to give the same answer — otherwise there is no way back.
    const a = autoPlace(items(quarter, 4), [page(1, [quarter])], grid, 1);
    const b = autoPlace(items(quarter, 4), [page(1, [quarter])], grid, 2);

    expect(a.placements.map((p) => p.publicationId)).not.toEqual(
      b.placements.map((p) => p.publicationId),
    );
    // Whatever the order, the same ads are placed and the page is just as full.
    expect(new Set(a.placements.map((p) => p.publicationId))).toEqual(
      new Set(b.placements.map((p) => p.publicationId)),
    );
  });
});

describe("the page type that was sold", () => {
  const typed = (n: number, type: string, openToAny = true): AutoPlacePage => ({
    ...page(n, [quarter]),
    pageTypeId: type,
    openToAny,
  });
  const sold = (id: string, type: string | null): AutoPlaceItem => ({
    publicationId: id,
    shape: quarter,
    pageTypeId: type,
  });

  it("puts an ad sold for the cover on the cover, even though the cover is closed to auto-placement", () => {
    const result = autoPlace([sold("a", "cover")], [typed(1, "cover", false), typed(2, "inner")], grid);
    expect(result.placements).toEqual([expect.objectContaining({ publicationId: "a", pageId: "p1" })]);
  });

  it("never puts an inner-page ad on the cover, even when the cover has room", () => {
    const result = autoPlace([sold("a", "inner")], [typed(1, "cover"), typed(2, "inner")], grid);
    expect(result.placements[0]).toMatchObject({ pageId: "p2" });
  });

  it("leaves an ad unplaced rather than on a page of another type", () => {
    const result = autoPlace([sold("a", "back")], [typed(1, "cover"), typed(2, "inner")], grid);
    expect(result.placements).toEqual([]);
    expect(result.unplaced.map((i) => i.publicationId)).toEqual(["a"]);
  });

  it("an ad with no recorded type goes only on pages open to auto-placement", () => {
    const result = autoPlace([sold("a", null)], [typed(1, "cover", false), typed(2, "inner")], grid);
    expect(result.placements[0]).toMatchObject({ pageId: "p2" });
  });
});

describe("how many sheets the leftovers need", () => {
  it("is zero when nothing is left over", () => {
    expect(sheetsNeededFor([], grid)).toBe(0);
  });

  it("is at least one whenever anything is", () => {
    expect(sheetsNeededFor(items(eighth, 1), grid)).toBe(1);
  });

  it("grows with the area waiting to be placed", () => {
    // Four full pages need two sheets of two sides each.
    expect(sheetsNeededFor(items(full, 4), grid)).toBe(2);
  });
});

function toRect(shape: ShapeSpec) {
  return (p: { col: number; row: number }): GridRect => ({
    col: p.col,
    row: p.row,
    cols: shape.cols,
    rows: shape.rows,
  });
}

function expectNoOverlaps(rects: GridRect[]) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i]!, rects[j]!)).toBe(false);
    }
  }
}
