import { describe, expect, it } from "vitest";
import {
  coverage,
  findOverlappingPairs,
  overlapArea,
  overlaps,
  snap,
  toMillimetres,
  validateRect,
  validateSlot,
  type Rect,
} from "./slot-geometry";

const r = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

describe("bounds (rule 8)", () => {
  it("accepts a slot inside the page", () => {
    expect(validateRect(r(0, 0, 50, 50))).toBeNull();
    expect(validateRect(r(50, 50, 50, 50))).toBeNull();
  });

  it("rejects a slot that runs off the right edge", () => {
    expect(validateRect(r(60, 0, 50, 10))?.kind).toBe("out_of_bounds");
  });

  it("rejects a slot that runs off the bottom edge", () => {
    expect(validateRect(r(0, 80, 10, 30))?.kind).toBe("out_of_bounds");
  });

  it("rejects negative coordinates", () => {
    expect(validateRect(r(-5, 0, 10, 10))?.kind).toBe("out_of_bounds");
  });

  it("rejects zero or negative size", () => {
    expect(validateRect(r(0, 0, 0, 10))?.kind).toBe("non_positive");
    expect(validateRect(r(0, 0, 10, -1))?.kind).toBe("non_positive");
  });

  it("accepts a slot filling the whole page", () => {
    expect(validateRect(r(0, 0, 100, 100))).toBeNull();
  });
});

describe("overlap (rule 9)", () => {
  it("treats touching edges as fine — two columns side by side", () => {
    expect(overlaps(r(0, 0, 50, 100), r(50, 0, 50, 100))).toBe(false);
  });

  it("treats stacked slots sharing a horizontal edge as fine", () => {
    expect(overlaps(r(0, 0, 100, 50), r(0, 50, 100, 50))).toBe(false);
  });

  it("catches a one-unit overlap", () => {
    expect(overlaps(r(0, 0, 50, 100), r(49, 0, 50, 100))).toBe(true);
  });

  it("catches full containment", () => {
    expect(overlaps(r(0, 0, 100, 100), r(20, 20, 10, 10))).toBe(true);
  });

  it("reports the overlapping area", () => {
    expect(overlapArea(r(0, 0, 50, 50), r(25, 25, 50, 50))).toBe(625);
    expect(overlapArea(r(0, 0, 10, 10), r(50, 50, 10, 10))).toBe(0);
  });

  it("blocks a new slot that lands on an existing one", () => {
    const err = validateSlot(r(10, 10, 30, 30), [r(0, 0, 50, 50)]);
    expect(err?.kind).toBe("overlap");
    expect(err?.message).toBe("הסלוט חופף לסלוט אחר באותו עמוד");
  });

  it("allows a new slot that only touches an existing one", () => {
    expect(validateSlot(r(50, 0, 50, 50), [r(0, 0, 50, 50)])).toBeNull();
  });

  it("checks bounds before overlap, so the clearer error wins", () => {
    expect(validateSlot(r(90, 90, 30, 30), [r(0, 0, 10, 10)])?.kind).toBe("out_of_bounds");
  });

  it("finds every overlapping pair on a page", () => {
    const pairs = findOverlappingPairs([r(0, 0, 50, 50), r(25, 25, 50, 50), r(80, 80, 10, 10)]);
    expect(pairs).toEqual([[0, 1]]);
  });

  it("reports no pairs for a clean four-slot grid", () => {
    expect(
      findOverlappingPairs([
        r(0, 0, 50, 50),
        r(50, 0, 50, 50),
        r(0, 50, 50, 50),
        r(50, 50, 50, 50),
      ]),
    ).toEqual([]);
  });
});

describe("snapping", () => {
  it.each([
    [0, 0],
    [2, 0],
    [3, 5],
    [12, 10],
    [13, 15],
    [97, 95],
    [99, 100],
  ])("snaps %i to %i", (input, expected) => {
    expect(snap(input)).toBe(expected);
  });

  it("clamps outside the page", () => {
    expect(snap(-20)).toBe(0);
    expect(snap(140)).toBe(100);
  });
});

describe("coverage and unit conversion", () => {
  it("reports how much of the page is covered", () => {
    expect(coverage([r(0, 0, 50, 50)])).toBe(25);
    expect(coverage([r(0, 0, 100, 100)])).toBe(100);
  });

  it("converts percentages to millimetres against the real page size", () => {
    // Half of an A4 page: 210 x 297 mm
    expect(toMillimetres(r(0, 0, 50, 50), 210, 297)).toEqual({
      x: 0,
      y: 0,
      width: 105,
      height: 148.5,
    });
  });

  it("keeps the same percentages valid when the page size changes — the reason for storing percentages", () => {
    const slot = r(10, 10, 40, 20);
    expect(toMillimetres(slot, 210, 297).width).toBeCloseTo(84);
    expect(toMillimetres(slot, 297, 420).width).toBeCloseTo(118.8);
    expect(validateRect(slot)).toBeNull(); // unchanged, still valid
  });
});
