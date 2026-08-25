import { describe, expect, it } from "vitest";
import { deriveGrid, type DerivedGrid } from "./grid";
import {
  cellAtPointer,
  cellsOf,
  coverage,
  findOverlappingPairs,
  normalizePositions,
  overlapArea,
  overlaps,
  rectBetween,
  positionAllowed,
  positionsFor,
  toCanvasPercent,
  toMillimetres,
  validPositionCount,
  validateRect,
  validatePlacement,
  type Cell,
  type GridRect,
} from "./slot-geometry";

/** The seeded newspaper: Tabloid 279x432, margin 10, 6 columns, 12.5mm rows, 4mm gutter. */
const grid = deriveGrid({
  pageSize: "Tabloid",
  marginMm: 10,
  columns: 6,
  rowHeightMm: 12.5,
  gutterMm: 4,
}) as DerivedGrid;

const r = (col: number, row: number, cols: number, rows: number): GridRect => ({
  col,
  row,
  cols,
  rows,
});

describe("the seeded grid", () => {
  it("derives 6 columns by 24 rows", () => {
    expect(grid.columns).toBe(6);
    expect(grid.rows).toBe(24);
    expect(grid.columnWidthMm).toBeCloseTo(38.5);
  });
});

describe("bounds", () => {
  it("accepts a rect inside the page", () => {
    expect(validateRect(r(0, 0, 3, 12), grid)).toBeNull();
    expect(validateRect(r(3, 12, 3, 12), grid)).toBeNull();
  });

  it("rejects a rect that runs off the LEFT edge — col grows leftward in RTL", () => {
    expect(validateRect(r(4, 0, 3, 2), grid)?.kind).toBe("out_of_bounds");
  });

  it("rejects a rect that runs off the bottom edge", () => {
    expect(validateRect(r(0, 20, 2, 6), grid)?.kind).toBe("out_of_bounds");
  });

  it("rejects negative coordinates", () => {
    expect(validateRect(r(-1, 0, 2, 2), grid)?.kind).toBe("out_of_bounds");
  });

  it("rejects zero or negative size", () => {
    expect(validateRect(r(0, 0, 0, 2), grid)?.kind).toBe("non_positive");
    expect(validateRect(r(0, 0, 2, -1), grid)?.kind).toBe("non_positive");
  });

  it("rejects non-integer coordinates — cells are whole or nothing", () => {
    expect(validateRect(r(0.5, 0, 2, 2), grid)?.kind).toBe("non_positive");
    expect(validateRect(r(0, 0, 1.5, 2), grid)?.kind).toBe("non_positive");
  });

  it("accepts a rect filling the whole page", () => {
    expect(validateRect(r(0, 0, 6, 24), grid)).toBeNull();
  });
});

describe("overlap", () => {
  it("treats touching edges as fine — two columns side by side", () => {
    expect(overlaps(r(0, 0, 3, 24), r(3, 0, 3, 24))).toBe(false);
  });

  it("treats stacked rects sharing a horizontal edge as fine", () => {
    expect(overlaps(r(0, 0, 6, 12), r(0, 12, 6, 12))).toBe(false);
  });

  it("catches a one-cell overlap", () => {
    expect(overlaps(r(0, 0, 3, 24), r(2, 0, 3, 24))).toBe(true);
  });

  it("catches full containment", () => {
    expect(overlaps(r(0, 0, 6, 24), r(2, 2, 1, 1))).toBe(true);
  });

  it("reports the overlapping area in cells", () => {
    expect(overlapArea(r(0, 0, 3, 12), r(2, 10, 3, 12))).toBe(2);
    expect(overlapArea(r(0, 0, 1, 1), r(4, 4, 1, 1))).toBe(0);
  });

  it("blocks a placement that lands on an existing one", () => {
    const err = validatePlacement(r(1, 1, 2, 2), [r(0, 0, 3, 12)], grid);
    expect(err?.kind).toBe("overlap");
    expect(err?.message).toBe("המיקום חופף לשיבוץ אחר באותו עמוד");
  });

  it("allows a placement that only touches an existing one", () => {
    expect(validatePlacement(r(3, 0, 3, 12), [r(0, 0, 3, 12)], grid)).toBeNull();
  });

  it("checks bounds before overlap, so the clearer error wins", () => {
    expect(validatePlacement(r(5, 22, 3, 6), [r(0, 0, 1, 1)], grid)?.kind).toBe("out_of_bounds");
  });

  it("finds every overlapping pair on a page", () => {
    expect(findOverlappingPairs([r(0, 0, 3, 12), r(2, 10, 3, 12), r(5, 22, 1, 2)])).toEqual([
      [0, 1],
    ]);
  });

  it("reports no pairs for a clean four-rect grid", () => {
    expect(
      findOverlappingPairs([r(0, 0, 3, 12), r(3, 0, 3, 12), r(0, 12, 3, 12), r(3, 12, 3, 12)]),
    ).toEqual([]);
  });
});

describe("coverage", () => {
  it("reports how much of the page is covered", () => {
    expect(coverage([r(0, 0, 3, 12)], grid)).toBe(25);
    expect(coverage([r(0, 0, 6, 24)], grid)).toBe(100);
  });
});

describe("allowed positions", () => {
  /**
   * The positions that put a 6x4 strip flush against the foot of a 24-row page.
   * A position is the shape's top-start cell, NOT a cell it covers — the whole
   * point of the model: you place the shape, you do not shade an area and hope
   * the footprint fits inside it.
   */
  const bottomStrip: Cell[] = [[0, 20]];

  it("lists every cell a rect occupies", () => {
    expect(cellsOf(r(1, 2, 2, 2))).toEqual([
      [1, 2],
      [1, 3],
      [2, 2],
      [2, 3],
    ]);
  });

  it("accepts everything when there is no restriction — anywhere it fits", () => {
    expect(positionAllowed(r(0, 0, 6, 24), null)).toBe(true);
  });

  it("accepts a rect sitting on an allowed position", () => {
    expect(positionAllowed(r(0, 20, 6, 4), bottomStrip)).toBe(true);
  });

  it("rejects a rect one row off an allowed position", () => {
    // One row up is a different position, even though it overlaps the same
    // area. Under the old painted-area model this was accepted, which is
    // exactly the looseness that made "where may this ad go" unanswerable.
    expect(positionAllowed(r(0, 19, 6, 4), bottomStrip)).toBe(false);
  });

  it("counts every position a shape has when nothing restricts it", () => {
    // 6 wide leaves one column of choice; 4 tall leaves 21 rows.
    expect(validPositionCount({ cols: 6, rows: 4 }, null, grid)).toBe(21);
    expect(positionsFor({ cols: 6, rows: 4 }, grid)).toHaveLength(21);
  });

  it("counts only the chosen positions when they are restricted", () => {
    expect(validPositionCount({ cols: 6, rows: 4 }, bottomStrip, grid)).toBe(1);
  });

  it("returns zero when every chosen position hangs off the page", () => {
    // The shape grew after the positions were chosen. Zero is the number the
    // settings screen has to refuse to save.
    expect(validPositionCount({ cols: 6, rows: 8 }, bottomStrip, grid)).toBe(0);
  });

  it("offers no position at all for a shape bigger than the page", () => {
    expect(positionsFor({ cols: 7, rows: 4 }, grid)).toEqual([]);
    expect(positionsFor({ cols: 6, rows: 25 }, grid)).toEqual([]);
  });

  it("rejects a placement that is not on an allowed position", () => {
    const err = validatePlacement(r(0, 0, 6, 4), [], grid, bottomStrip);
    expect(err?.kind).toBe("outside_region");
  });

  it("normalizes positions — dedupes, drops ones the shape overhangs, sorts", () => {
    const messy: Cell[] = [
      [2, 1],
      [0, 0],
      [2, 1],
      [99, 0],
      [0, -1],
      // Fits horizontally, but a 2x2 starting on the last row would hang off.
      [0, 23],
    ];
    expect(normalizePositions(messy, { cols: 2, rows: 2 }, grid)).toEqual([
      [0, 0],
      [2, 1],
    ]);
  });
});

describe("RTL: col 0 is the RIGHT edge of the page", () => {
  it("puts column 0 on the right-hand side of the page, not at the left margin", () => {
    const first = toMillimetres(r(0, 0, 1, 1), grid);
    // 279 - (10 margin + 4 gutter) - 38.5 width = 226.5mm from the LEFT edge.
    expect(first.xMm).toBeCloseTo(226.5);
    expect(first.xMm).toBeGreaterThan(grid.pageWidthMm / 2);
  });

  it("puts the last column at the left margin", () => {
    const last = toMillimetres(r(5, 0, 1, 1), grid);
    expect(last.xMm).toBeCloseTo(14); // margin + gutter
  });

  it("orders the columns right to left", () => {
    const xs = [0, 1, 2, 3, 4, 5].map((col) => toMillimetres(r(col, 0, 1, 1), grid).xMm);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
  });

  it("reads the right-most pointer position as column 0", () => {
    const box = { top: 0, right: 600, width: 600, height: 1200 };
    expect(cellAtPointer({ clientX: 599, clientY: 1 }, box, grid)).toEqual([0, 0]);
  });

  it("reads the left-most pointer position as the LAST column", () => {
    const box = { top: 0, right: 600, width: 600, height: 1200 };
    expect(cellAtPointer({ clientX: 1, clientY: 1 }, box, grid)).toEqual([5, 0]);
  });

  it("clamps a pointer that escapes the box", () => {
    const box = { top: 0, right: 600, width: 600, height: 1200 };
    expect(cellAtPointer({ clientX: 900, clientY: -50 }, box, grid)).toEqual([0, 0]);
    expect(cellAtPointer({ clientX: -900, clientY: 9999 }, box, grid)).toEqual([5, 23]);
  });

  it("agrees with the canvas percentages — both measure from the inline start", () => {
    const rect = r(1, 3, 2, 4);
    const pct = toCanvasPercent(rect, grid);
    const mm = toMillimetres(rect, grid);
    // startPct measures from the right; xMm from the left. Together they must
    // account for the whole page width, give or take margin and gutter.
    const startFromRightMm = grid.pageWidthMm - mm.xMm - mm.widthMm;
    expect(pct.startPct / 100).toBeCloseTo(
      (startFromRightMm - grid.marginMm - grid.gutterMm) /
        (grid.columns * (grid.columnWidthMm + grid.gutterMm)),
      2,
    );
  });
});

describe("millimetre conversion", () => {
  it("spans the gutters between the cells it covers", () => {
    const mm = toMillimetres(r(0, 0, 2, 2), grid);
    expect(mm.widthMm).toBeCloseTo(2 * 38.5 + 4);
    expect(mm.heightMm).toBeCloseTo(2 * 12.5 + 4);
  });

  it("places the top row below the margin and the frame gutter", () => {
    expect(toMillimetres(r(0, 0, 1, 1), grid).yMm).toBeCloseTo(14);
  });

  it("fills the page when the rect fills the grid", () => {
    const mm = toMillimetres(r(0, 0, 6, 24), grid);
    // Everything but the margin and the two frame gutters.
    expect(mm.xMm).toBeCloseTo(14);
    expect(mm.xMm + mm.widthMm).toBeCloseTo(grid.pageWidthMm - 14);
  });

  it("rejects a shape valid on a 6-column grid when the grid narrows to 4", () => {
    const narrow = deriveGrid({
      pageSize: "Tabloid",
      marginMm: 10,
      columns: 4,
      rowHeightMm: 12.5,
      gutterMm: 4,
    }) as DerivedGrid;
    const halfPage = r(0, 0, 6, 12);
    expect(validateRect(halfPage, grid)).toBeNull();
    expect(validateRect(halfPage, narrow)?.kind).toBe("out_of_bounds");
  });
});

describe("rectBetween", () => {
  it("builds the same rect regardless of drag direction", () => {
    expect(rectBetween([1, 2], [3, 5])).toEqual({ col: 1, row: 2, cols: 3, rows: 4 });
    expect(rectBetween([3, 5], [1, 2])).toEqual({ col: 1, row: 2, cols: 3, rows: 4 });
  });

  it("makes a single cell a 1x1 rect", () => {
    expect(rectBetween([2, 2], [2, 2])).toEqual({ col: 2, row: 2, cols: 1, rows: 1 });
  });
});
