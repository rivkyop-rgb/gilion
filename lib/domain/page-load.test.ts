import { describe, expect, it } from "vitest";

import { deriveGrid, type DerivedGrid } from "./grid";
import { percentUsed, typeLoad, type LoadItem } from "./page-load";
import type { ShapeSpec } from "./placement";

/** 8 x 8, no gutter. */
const grid: DerivedGrid = deriveGrid({
  pageSize: "custom",
  customWidthMm: 180,
  customHeightMm: 180,
  marginMm: 10,
  columns: 8,
  rowHeightMm: 20,
  gutterMm: 0,
})!;

const half: ShapeSpec = { id: "h", name: "חצי", cols: 8, rows: 4, positions: null };
const quarter: ShapeSpec = { id: "q", name: "רבע", cols: 4, rows: 4, positions: null };

const cover = (
  items: LoadItem[],
  reserved = [] as Array<{ col: number; row: number; cols: number; rows: number }>,
) => ({
  pages: 1,
  grid,
  allowedShapes: [half, quarter],
  reserved,
  items,
});

describe("how full a cover is", () => {
  it("fits a half next to a half", () => {
    const load = typeLoad(
      cover([
        { id: "a", shape: half, stage: "approved" },
        { id: "b", shape: half, stage: "this" },
      ]),
      ["approved", "pending", "this"],
    );
    expect(load.overflow).toBe(0);
    expect(percentUsed(load, ["approved", "this"])).toBe(100);
  });

  it("says when the new sale does not fit", () => {
    const load = typeLoad(
      cover([
        { id: "a", shape: half, stage: "approved" },
        { id: "b", shape: quarter, stage: "pending" },
        { id: "c", shape: half, stage: "this" },
      ]),
      ["approved", "pending", "this"],
    );
    expect(load.overflow).toBe(1);
  });

  it("does not count drafts as taken unless asked to", () => {
    const load = typeLoad(
      cover([
        { id: "a", shape: half, stage: "draft" },
        { id: "b", shape: half, stage: "draft" },
        { id: "c", shape: half, stage: "this" },
      ]),
      ["approved", "pending", "this"],
    );
    expect(load.overflow).toBe(0);
    expect(load.used.draft).toBe(64);
  });

  it("subtracts reserved areas from what can be sold", () => {
    const load = typeLoad(
      cover(
        [
          { id: "a", shape: half, stage: "approved" },
          { id: "b", shape: half, stage: "this" },
        ],
        [{ col: 0, row: 0, cols: 8, rows: 2 }],
      ),
      ["approved", "this"],
    );
    expect(load.totalCells).toBe(48);
    expect(load.overflow).toBe(1);
  });
});
