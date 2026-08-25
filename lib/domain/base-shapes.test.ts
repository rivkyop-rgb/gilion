import { describe, expect, it } from "vitest";
import { BASE_SHAPES, materializeBaseShapes } from "./base-shapes";
import { deriveGrid, shapeFitsGrid, type DerivedGrid } from "./grid";
import { validPositionCount } from "./slot-geometry";

const grid = deriveGrid({
  pageSize: "Tabloid",
  marginMm: 10,
  columns: 6,
  rowHeightMm: 12.5,
  gutterMm: 4,
}) as DerivedGrid;

const byKey = (key: string) => materializeBaseShapes(grid).find((s) => s.key === key)!;

describe("materializeBaseShapes on the seeded 6x24 grid", () => {
  it.each([
    ["full", 6, 24],
    ["half_h", 6, 12],
    ["half_v", 3, 24],
    ["quarter", 3, 12],
    ["eighth", 3, 6],
    ["strip", 6, 4],
  ])("resolves %s to %i x %i cells", (key, cols, rows) => {
    const shape = byKey(key);
    expect([shape.cols, shape.rows]).toEqual([cols, rows]);
  });

  it("produces one shape per base entry, in the same order", () => {
    expect(materializeBaseShapes(grid).map((s) => s.key)).toEqual(BASE_SHAPES.map((s) => s.key));
  });

  it("leaves five of the six unconstrained", () => {
    const constrained = materializeBaseShapes(grid).filter((s) => s.positionMode === "region");
    expect(constrained.map((s) => s.key)).toEqual(["strip"]);
  });
});

describe("the bottom strip — the built-in worked example of a constrained shape", () => {
  it("may only be placed flush against the foot of the page", () => {
    const strip = byKey("strip");
    expect(strip.allowedCells).not.toBeNull();
    // Every stored value is a POSITION — the shape's top-start cell — so the
    // only row that leaves the strip touching the page foot is the last one
    // that fits.
    const rows = new Set(strip.allowedCells!.map(([, row]) => row));
    expect([...rows]).toEqual([grid.rows - strip.rows]);
  });

  it("has exactly one valid position — it spans the full page width", () => {
    const strip = byKey("strip");
    expect(validPositionCount(strip, strip.allowedCells, grid)).toBe(1);
  });
});

describe("every base shape is usable on the grid it was built for", () => {
  it.each(BASE_SHAPES.map((s) => s.key))("%s fits and has a valid position", (key) => {
    const shape = byKey(key);
    expect(shapeFitsGrid(shape, grid)).toBe(true);
    expect(validPositionCount(shape, shape.allowedCells, grid)).toBeGreaterThan(0);
  });
});

describe("adapting to other grids", () => {
  it("scales with the grid rather than carrying fixed cell counts", () => {
    const wide = deriveGrid({
      pageSize: "Broadsheet",
      marginMm: 15,
      columns: 8,
      rowHeightMm: 10,
      gutterMm: 3,
    }) as DerivedGrid;
    const halfH = materializeBaseShapes(wide).find((s) => s.key === "half_h")!;
    expect(halfH.cols).toBe(8);
    expect(halfH.rows).toBe(Math.round(wide.rows / 2));
  });

  it("never rounds a shape down to nothing on a tiny grid", () => {
    const tiny = deriveGrid({
      pageSize: "A4",
      marginMm: 10,
      columns: 1,
      rowHeightMm: 90,
      gutterMm: 0,
    }) as DerivedGrid;
    for (const shape of materializeBaseShapes(tiny)) {
      expect(shape.cols).toBeGreaterThanOrEqual(1);
      expect(shape.rows).toBeGreaterThanOrEqual(1);
      expect(shapeFitsGrid(shape, tiny)).toBe(true);
    }
  });
});
