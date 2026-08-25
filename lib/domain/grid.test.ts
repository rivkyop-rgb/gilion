import { describe, expect, it } from "vitest";
import {
  MAX_COLUMNS,
  cmToMm,
  colsForWidthCm,
  deriveGrid,
  footprintMm,
  formatCm,
  mmToCm,
  rowsForHeightCm,
  shapeFitsGrid,
  validateGridSettings,
  type DerivedGrid,
} from "./grid";

const base = {
  pageSize: "Tabloid",
  marginMm: 10,
  columns: 6,
  rowHeightMm: 12.5,
  gutterMm: 4,
};

describe("deriveGrid", () => {
  it("derives the column width with a gutter on both sides of every column", () => {
    const grid = deriveGrid(base)!;
    // (279 - 20 margin - 7 gutters of 4) / 6 = 38.5
    expect(grid.columnWidthMm).toBeCloseTo(38.5);
  });

  it("derives the row count, leaving room for the frame gutter", () => {
    // (432 - 20 margin - 4 gutter) / (12.5 + 4) = 24.7 -> 24
    expect(deriveGrid(base)!.rows).toBe(24);
  });

  it("fits every derived cell plus its gutters inside the page", () => {
    const grid = deriveGrid(base)!;
    const usedWidth =
      grid.columns * grid.columnWidthMm + (grid.columns + 1) * grid.gutterMm + 2 * grid.marginMm;
    const usedHeight =
      grid.rows * grid.rowHeightMm + (grid.rows + 1) * grid.gutterMm + 2 * grid.marginMm;
    expect(usedWidth).toBeCloseTo(grid.pageWidthMm);
    expect(usedHeight).toBeLessThanOrEqual(grid.pageHeightMm);
  });

  it("packs more columns in when the gutter is zero", () => {
    const noGutter = deriveGrid({ ...base, gutterMm: 0 })!;
    expect(noGutter.columnWidthMm).toBeCloseTo(259 / 6);
    expect(noGutter.columnWidthMm).toBeGreaterThan(deriveGrid(base)!.columnWidthMm);
  });

  it("resolves a custom page size through pageDimensions", () => {
    const grid = deriveGrid({
      ...base,
      pageSize: "custom",
      customWidthMm: 400,
      customHeightMm: 600,
    })!;
    expect(grid.pageWidthMm).toBe(400);
    expect(grid.pageHeightMm).toBe(600);
  });

  it("returns null when a custom size is missing its dimensions", () => {
    expect(deriveGrid({ ...base, pageSize: "custom" })).toBeNull();
    expect(deriveGrid({ ...base, pageSize: "nonsense" })).toBeNull();
  });
});

describe("validateGridSettings", () => {
  it("accepts the seeded settings", () => {
    expect(validateGridSettings(base)).toEqual([]);
  });

  it("requires at least one column", () => {
    expect(validateGridSettings({ ...base, columns: 0 })[0]?.field).toBe("columns");
  });

  it("requires whole columns", () => {
    expect(validateGridSettings({ ...base, columns: 2.5 })[0]?.field).toBe("columns");
  });

  it("caps the column count", () => {
    expect(validateGridSettings({ ...base, columns: MAX_COLUMNS + 1 })[0]?.field).toBe("columns");
  });

  it("allows the 26 columns a 1 cm module needs on a Tabloid page", () => {
    // The ceiling used to be 24, which made the whole-centimetre module below
    // impossible to express.
    expect(validateGridSettings({ ...base, columns: 26 })).toEqual([]);
  });

  it("requires a positive row height", () => {
    expect(validateGridSettings({ ...base, rowHeightMm: 0 })[0]?.field).toBe("rowHeightMm");
  });

  it("rejects a negative gutter", () => {
    expect(validateGridSettings({ ...base, gutterMm: -1 })[0]?.field).toBe("gutterMm");
  });

  it("rejects a gutter that leaves no room for the columns", () => {
    const errors = validateGridSettings({ ...base, gutterMm: 60 });
    expect(errors.some((e) => e.field === "columns")).toBe(true);
  });

  it("rejects a row height that leaves no rows at all", () => {
    const errors = validateGridSettings({ ...base, rowHeightMm: 500 });
    expect(errors.some((e) => e.field === "rowHeightMm")).toBe(true);
  });

  it("reports the bad input before the derived consequence", () => {
    // A negative gutter is the cause; there is no point also complaining that
    // the derived grid it produces is strange.
    expect(validateGridSettings({ ...base, gutterMm: -1 })).toHaveLength(1);
  });
});

describe("shapeFitsGrid", () => {
  const grid = deriveGrid(base) as DerivedGrid;

  it("accepts a shape inside the grid", () => {
    expect(shapeFitsGrid({ cols: 6, rows: 24 }, grid)).toBe(true);
    expect(shapeFitsGrid({ cols: 1, rows: 1 }, grid)).toBe(true);
  });

  it("rejects a shape wider or taller than the grid", () => {
    expect(shapeFitsGrid({ cols: 7, rows: 1 }, grid)).toBe(false);
    expect(shapeFitsGrid({ cols: 1, rows: 25 }, grid)).toBe(false);
  });

  it("rejects an empty footprint", () => {
    expect(shapeFitsGrid({ cols: 0, rows: 4 }, grid)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Centimetres — the unit the screens are in
// ---------------------------------------------------------------------------

describe("centimetres", () => {
  /** The shipped default: a 1 cm row with no gutter. */
  const round = deriveGrid({
    pageSize: "Tabloid",
    marginMm: 10,
    columns: 6,
    rowHeightMm: 10,
    gutterMm: 0,
  })!;

  it("derives 41 one-centimetre rows on a Tabloid page", () => {
    expect(round.rows).toBe(41);
    expect(round.columnWidthMm).toBeCloseTo(43.167);
  });

  it("prints a shape of N rows at exactly N centimetres when the gutter is zero", () => {
    // This is the entire reason for the 1 cm / no gutter default: a person can
    // read "10" and know the ad is 10 cm tall.
    for (const rows of [1, 5, 10, 41]) {
      expect(mmToCm(footprintMm({ cols: 1, rows }, round).heightMm)).toBeCloseTo(rows);
    }
  });

  it("shortens every printed height by exactly the gutter when there is one", () => {
    const gutter = 4;
    const withGutter = deriveGrid({ ...base, rowHeightMm: 10, gutterMm: gutter })!;
    const ten = footprintMm({ cols: 1, rows: 10 }, withGutter).heightMm;
    // 10 rows of 10 mm plus 9 gutters of 4 = 136, i.e. 10 cm of rows plus the
    // gutters between them. The number a user reads is never round again.
    expect(ten).toBeCloseTo(10 * 10 + 9 * gutter);
  });

  it("excludes the frame gutter from a shape's own width", () => {
    // The gutter against the page frame belongs to the page, not to the ad.
    const grid = deriveGrid({ ...base, gutterMm: 4 })!;
    expect(footprintMm({ cols: 2, rows: 1 }, grid).widthMm).toBeCloseTo(2 * grid.columnWidthMm + 4);
  });

  it("rounds a typed height to the nearest whole row", () => {
    expect(rowsForHeightCm(7, round)).toBe(7);
    expect(rowsForHeightCm(7.4, round)).toBe(7);
    expect(rowsForHeightCm(7.6, round)).toBe(8);
  });

  it("never rounds a positive height down to nothing", () => {
    expect(rowsForHeightCm(0.1, round)).toBe(1);
    expect(rowsForHeightCm(0, round)).toBe(1);
  });

  it("does NOT clamp a height taller than the page", () => {
    // A silent trim would save a shape the user did not ask for. The oversize
    // number has to survive so shapeFitsGrid can refuse it.
    const rows = rowsForHeightCm(100, round);
    expect(rows).toBeGreaterThan(round.rows);
    expect(shapeFitsGrid({ cols: 1, rows }, round)).toBe(false);
  });

  it("rounds a typed width to the nearest whole column", () => {
    expect(colsForWidthCm(4.3, round)).toBe(1);
    expect(colsForWidthCm(8.6, round)).toBe(2);
    expect(colsForWidthCm(8.0, round)).toBe(2);
  });

  it("survives a degenerate grid instead of returning NaN", () => {
    const dead = { ...round, rowHeightMm: 0, gutterMm: 0, columnWidthMm: 0 };
    expect(rowsForHeightCm(5, dead)).toBe(1);
    expect(colsForWidthCm(5, dead)).toBe(1);
  });

  it("formats to one decimal, the precision a print shop works to", () => {
    expect(formatCm(43.167)).toBe("4.3");
    expect(formatCm(100)).toBe("10.0");
    expect(formatCm(0)).toBe("0.0");
  });

  it("round-trips centimetres and millimetres", () => {
    expect(cmToMm(1)).toBe(10);
    expect(mmToCm(cmToMm(12.5))).toBeCloseTo(12.5);
  });
});
