import { describe, expect, it } from "vitest";

import { materializeBaseShapes } from "./base-shapes";
import { deriveGrid, type DerivedGrid } from "./grid";
import { planRescale, sizeForRatio, gridChanged, type RescaleShape } from "./shape-rescale";
import { validPositionCount } from "./slot-geometry";

/**
 * The seeded newspaper: Tabloid, 0.95 cm margin, 26 columns of 1 cm and rows of
 * 1 cm — 26 × 41 cells (see e2e/helpers.ts GRID).
 */
const wide: DerivedGrid = deriveGrid({
  pageSize: "Tabloid",
  marginMm: 9.5,
  columns: 26,
  rowHeightMm: 10,
  gutterMm: 0,
})!;

/** The same page with 1.5 cm rows — 26 × 27. Fewer rows, same columns. */
const short: DerivedGrid = deriveGrid({
  pageSize: "Tabloid",
  marginMm: 9.5,
  columns: 26,
  rowHeightMm: 15,
  gutterMm: 0,
})!;

/** The catalogue exactly as a newspaper created on `wide` would hold it. */
function catalogue(): RescaleShape[] {
  return materializeBaseShapes(wide).map((s, i) => ({
    id: `sh_${i}`,
    name: s.name,
    cols: s.cols,
    rows: s.rows,
    positionMode: s.positionMode,
    allowedCells: s.allowedCells,
    baseKey: s.key,
  }));
}

const find = (shapes: RescaleShape[], key: string) => shapes.find((s) => s.baseKey === key)!;
const changeFor = (plan: ReturnType<typeof planRescale>, id: string) =>
  plan.changes.find((c) => c.id === id)!;

describe("the fixture grids", () => {
  it("are what the tests below assume", () => {
    expect([wide.columns, wide.rows]).toEqual([26, 41]);
    expect([short.columns, short.rows]).toEqual([26, 27]);
    expect(gridChanged(wide, short)).toBe(true);
    expect(gridChanged(wide, wide)).toBe(false);
  });
});

describe("a base shape follows the page", () => {
  it("keeps half a page half a page", () => {
    const shapes = catalogue();
    const half = find(shapes, "half_h");
    // 26 x 20 on the tall grid: floor(41 / 2), so that TWO of them fit.
    expect([half.cols, half.rows]).toEqual([26, 20]);

    const change = changeFor(planRescale(shapes, wide, short), half.id);
    expect(change.action).toBe("rescaled");
    // 26 x 13 on the short one: floor(27 / 2).
    expect(change.to).toEqual({ cols: 26, rows: 13 });
  });

  it("lands on exactly what a NEW newspaper of that size would get", () => {
    // The whole point: a rescaled catalogue and a freshly created one must
    // agree, or "half a page" means two things depending on history.
    const plan = planRescale(catalogue(), wide, short);
    const fresh = materializeBaseShapes(short);

    for (const shape of catalogue()) {
      const change = changeFor(plan, shape.id);
      const equivalent = fresh.find((f) => f.key === shape.baseKey)!;
      expect([change.to.cols, change.to.rows]).toEqual([equivalent.cols, equivalent.rows]);
    }
  });

  it("keeps a full page fitting the page it is named after", () => {
    const full = find(catalogue(), "full");
    const change = changeFor(planRescale(catalogue(), wide, short), full.id);
    expect(change.to).toEqual({ cols: short.columns, rows: short.rows });
  });

  it("reports nothing to do when the grid did not move", () => {
    const plan = planRescale(catalogue(), wide, wide);
    expect(plan.rescaled).toEqual([]);
    expect(plan.changes.every((c) => c.action === "kept")).toBe(true);
  });
});

describe("a region-constrained shape keeps its region", () => {
  it("moves the bottom strip's allowed row onto the new page", () => {
    const shapes = catalogue();
    const strip = find(shapes, "strip");
    expect(strip.positionMode).toBe("region");
    // Flush against the foot of a 41-row page.
    expect(strip.allowedCells![0]![1]).toBe(wide.rows - strip.rows);

    const change = changeFor(planRescale(shapes, wide, short), strip.id);
    expect(change.allowedCells![0]![1]).toBe(short.rows - change.to.rows);
  });

  it("leaves it placeable — the failure that read as a bug in the board", () => {
    const strip = find(catalogue(), "strip");
    const change = changeFor(planRescale(catalogue(), wide, short), strip.id);

    // Before the fix the stored cells were absolute, so normalizePositions
    // dropped every one of them and the shape had nowhere legal to go.
    expect(validPositionCount(change.to, change.allowedCells, short)).toBeGreaterThan(0);
    expect(validPositionCount(strip, strip.allowedCells, short)).toBe(0);
  });
});

describe("what the system must not touch", () => {
  it("leaves a shape the newspaper invented exactly as it is", () => {
    const own: RescaleShape = {
      id: "sh_own",
      name: "מודעת חסות",
      cols: 8,
      rows: 12,
      positionMode: "anywhere",
      allowedCells: null,
      baseKey: null,
    };

    const change = changeFor(planRescale([own], wide, short), "sh_own");
    expect(change.action).toBe("kept");
    expect(change.to).toEqual({ cols: 8, rows: 12 });
  });

  it("leaves a base shape whose size somebody typed, and stops calling it base", () => {
    const shapes = catalogue();
    const quarter = find(shapes, "quarter");
    // Same key, a size that is not what the ratio gives on the old grid.
    quarter.cols = 10;
    quarter.rows = 18;

    const change = changeFor(planRescale(shapes, wide, short), quarter.id);
    expect(change.action).toBe("detached");
    expect(change.to).toEqual({ cols: 10, rows: 18 });
    expect(change.note).toContain("ידנית");
  });
});

describe("warnings — left alone, and said out loud", () => {
  it("flags a shape of the newspaper's own that is taller than the new page", () => {
    const own: RescaleShape = {
      id: "sh_tall",
      name: "עמודה מלאה",
      cols: 6,
      rows: 40,
      positionMode: "anywhere",
      allowedCells: null,
      baseKey: null,
    };

    const plan = planRescale([own], wide, short);
    expect(plan.warnings).toHaveLength(1);
    expect(changeFor(plan, "sh_tall").action).toBe("unfittable");
    expect(changeFor(plan, "sh_tall").note).toContain("גדולה מהעמוד החדש");
    // Flagged, NOT resized: it is not the system's number to change.
    expect(changeFor(plan, "sh_tall").to).toEqual({ cols: 6, rows: 40 });
  });

  it("flags one whose own allowed region falls off the new page", () => {
    const own: RescaleShape = {
      id: "sh_region",
      name: "פס תחתון משלנו",
      cols: 10,
      rows: 4,
      positionMode: "region",
      // Legal on the 41-row page, nowhere near a 27-row one.
      allowedCells: [[0, 35]],
      baseKey: null,
    };

    const plan = planRescale([own], wide, short);
    expect(changeFor(plan, "sh_region").action).toBe("unfittable");
    expect(changeFor(plan, "sh_region").note).toContain("האזור המותר");
  });

  it("does not flag a shape that still fits", () => {
    const own: RescaleShape = {
      id: "sh_small",
      name: "מודעונת",
      cols: 4,
      rows: 4,
      positionMode: "anywhere",
      allowedCells: null,
      baseKey: null,
    };
    expect(planRescale([own], wide, short).warnings).toEqual([]);
  });
});

describe("growing the page, not only shrinking it", () => {
  it("takes the catalogue back up with it", () => {
    const shapes = catalogue().map((s) => ({ ...s }));
    // Start from the short grid's sizes, then grow back to the tall one.
    for (const s of shapes) {
      const grown = changeFor(planRescale(catalogue(), wide, short), s.id);
      s.cols = grown.to.cols;
      s.rows = grown.to.rows;
      s.allowedCells = grown.allowedCells;
    }

    const back = planRescale(shapes, short, wide);
    const half = shapes.find((s) => s.baseKey === "half_h")!;
    expect(changeFor(back, half.id).to).toEqual({ cols: 26, rows: 20 });
  });
});

describe("sizeForRatio", () => {
  it("never rounds a shape away to nothing", () => {
    const tiny = deriveGrid({
      pageSize: "custom",
      customWidthMm: 100,
      customHeightMm: 100,
      marginMm: 10,
      columns: 2,
      rowHeightMm: 40,
      gutterMm: 0,
    })!;
    expect(sizeForRatio({ colsRatio: 1 / 8, rowsRatio: 1 / 8 }, tiny)).toEqual({
      cols: 1,
      rows: 1,
    });
  });

  it("never returns something larger than the page", () => {
    expect(sizeForRatio({ colsRatio: 2, rowsRatio: 3 }, short)).toEqual({
      cols: short.columns,
      rows: short.rows,
    });
  });
});
