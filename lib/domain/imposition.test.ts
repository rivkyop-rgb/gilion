import { describe, expect, it } from "vitest";

import {
  impose,
  isStitchable,
  pagesOn,
  sheetsNeeded,
  sideLabel,
  type PrintedSide,
} from "./imposition";

/** `[left, right]` of one side, the way the flat sheet lies. */
const halves = (side: PrintedSide) => [side.left, side.right];
const find = (sides: PrintedSide[], sheet: number, side: "outer" | "inner") =>
  sides.find((s) => s.sheet === sheet && s.side === side)!;

describe("how many sheets", () => {
  it("counts four pages to a sheet", () => {
    expect(sheetsNeeded(4)).toBe(1);
    expect(sheetsNeeded(8)).toBe(2);
    expect(sheetsNeeded(16)).toBe(4);
  });

  it("rounds a short issue up to a whole sheet, because paper does", () => {
    expect(sheetsNeeded(6)).toBe(2);
    expect(sheetsNeeded(1)).toBe(1);
  });

  it("has nothing to print for an empty issue", () => {
    expect(sheetsNeeded(0)).toBe(0);
    expect(impose(0)).toEqual([]);
  });

  it("knows which counts can actually be stapled", () => {
    expect(isStitchable(4)).toBe(true);
    expect(isStitchable(8)).toBe(true);
    expect(isStitchable(6)).toBe(false);
    expect(isStitchable(0)).toBe(false);
  });
});

describe("a four-page issue — one sheet", () => {
  const sides = impose(4);

  it("prints two sides", () => {
    expect(sides).toHaveLength(2);
    expect(sides.map((s) => s.side)).toEqual(["outer", "inner"]);
  });

  it("puts the cover and the back on the same piece of paper", () => {
    // Hebrew binds on the right, so the cover's spine edge is its RIGHT edge
    // and it lies in the LEFT half of the flat sheet.
    expect(halves(find(sides, 1, "outer"))).toEqual([1, 4]);
  });

  it("puts pages 2 and 3 on its other face", () => {
    // Open the cover: page 2 is the back of page 1 and swings to the right,
    // page 3 faces it on the left.
    expect(halves(find(sides, 1, "inner"))).toEqual([3, 2]);
  });
});

describe("an eight-page issue — two nested sheets", () => {
  const sides = impose(8);

  it("prints four sides, outermost sheet first", () => {
    expect(sides).toHaveLength(4);
    expect(sides.map((s) => `${s.sheet}${s.side[0]}`)).toEqual(["1o", "1i", "2o", "2i"]);
  });

  it("lays every side out the way the press needs it", () => {
    expect(halves(find(sides, 1, "outer"))).toEqual([1, 8]);
    expect(halves(find(sides, 1, "inner"))).toEqual([7, 2]);
    expect(halves(find(sides, 2, "outer"))).toEqual([3, 6]);
    expect(halves(find(sides, 2, "inner"))).toEqual([5, 4]);
  });

  /**
   * The check that would catch a mirrored or off-by-one imposition: walk the
   * booklet the way a reader does and confirm each turn lands on the next two
   * pages. An arithmetic slip that still produces plausible-looking pairs fails
   * here and nowhere else.
   */
  it("reads as 1,2,3…8 when the sheets are nested and turned", () => {
    // Nested: sheet 1 outside, sheet 2 inside it. Reading order is
    //   cover · (inner of 1 right, outer of 2 left) · … · back
    const s1o = find(sides, 1, "outer");
    const s1i = find(sides, 1, "inner");
    const s2o = find(sides, 2, "outer");
    const s2i = find(sides, 2, "inner");

    expect(s1o.left).toBe(1); // cover
    expect([s1i.right, s2o.left]).toEqual([2, 3]); // first turn
    expect([s2i.right, s2i.left]).toEqual([4, 5]); // second turn — one sheet
    expect([s2o.right, s1i.left]).toEqual([6, 7]); // third turn
    expect(s1o.right).toBe(8); // back
  });
});

describe("binding on the left instead — the English mirror", () => {
  it("swaps every pair and nothing else", () => {
    const rtl = impose(8);
    const ltr = impose(8, { bindOnRight: false });

    expect(ltr).toHaveLength(rtl.length);
    for (let i = 0; i < rtl.length; i++) {
      expect(ltr[i]!.sheet).toBe(rtl[i]!.sheet);
      expect(ltr[i]!.side).toBe(rtl[i]!.side);
      expect([ltr[i]!.left, ltr[i]!.right]).toEqual([rtl[i]!.right, rtl[i]!.left]);
    }
  });

  it("puts an English cover on the right of the sheet", () => {
    expect(halves(find(impose(4, { bindOnRight: false }), 1, "outer"))).toEqual([4, 1]);
  });
});

describe("every page appears exactly once", () => {
  it.each([4, 8, 12, 16, 40])("across a %i-page issue", (n) => {
    const printed = pagesOn(impose(n));
    expect(printed).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  });

  it("never prints a page twice, in either direction", () => {
    for (const bindOnRight of [true, false]) {
      const printed = pagesOn(impose(12, { bindOnRight }));
      expect(new Set(printed).size).toBe(printed.length);
    }
  });
});

describe("an issue that cannot be stapled still produces a file", () => {
  const sides = impose(6);

  it("pads the last sheet with blanks rather than refusing", () => {
    // Six pages is not foldable, and the composer prevents it — but an issue
    // built before that rule still has to reach a press.
    expect(sides).toHaveLength(4);
    expect(pagesOn(sides)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  /**
   * And this is the argument for never allowing it.
   *
   * The blanks are pages 7 and 8 — the END of the reading order — and in a
   * saddle-stitched booklet the last page is the BACK COVER, which lives on the
   * OUTERMOST sheet next to the front cover. So a six-page issue does not come
   * out with a discreet gap in the middle: it comes out with a blank back
   * cover, the second most visible surface the newspaper has.
   *
   * Nothing here can fix that — it is what folding six pages means. It is why
   * the composer adds four pages at a time and why removal refuses to break the
   * multiple (decided 07/09/2026).
   */
  it("puts the blanks on the OUTER sheet, which is to say the back cover", () => {
    const blanks = sides.flatMap((s) => [s.left, s.right]).filter((p) => p === null);
    expect(blanks).toHaveLength(2);

    expect(find(sides, 1, "outer").right).toBeNull(); // page 8 — the back cover
    expect(find(sides, 1, "inner").left).toBeNull(); // page 7 — facing it
    // The front cover is untouched, and so is everything the reader reaches.
    expect(find(sides, 1, "outer").left).toBe(1);
    expect(halves(find(sides, 2, "outer"))).toEqual([3, 6]);
  });
});

describe("labels", () => {
  it("names a side the way a printer says it out loud", () => {
    expect(sideLabel({ sheet: 2, side: "inner", left: 5, right: 4 })).toBe("דף 2 · צד פנימי");
    expect(sideLabel({ sheet: 1, side: "outer", left: 1, right: 8 })).toBe("דף 1 · צד חיצוני");
  });
});
