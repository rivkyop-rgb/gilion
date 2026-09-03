import { describe, expect, it } from "vitest";

import { deriveGrid, type DerivedGrid } from "./grid";
import { checkReservation, reservedShare, shortSize } from "./reservation";
import { checkPlacement, type PlacementContext, type ShapeSpec } from "./placement";

/** 8 x 8, no gutter — every number below is arithmetic you can do in your head. */
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
const strip: ShapeSpec = { id: "s", name: "רצועה", cols: 8, rows: 2, positions: null };

describe("reserving an area of a page", () => {
  it("accepts a band across the top, flush with the edge", () => {
    const banner = { name: "כותרת העיתון", rect: { col: 0, row: 0, cols: 8, rows: 2 } };
    expect(checkReservation(banner, grid, [], [quarter, strip])).toBeNull();
  });

  it("needs a name — the board shows it inside an area with no image", () => {
    const rejection = checkReservation(
      { name: "   ", rect: { col: 0, row: 0, cols: 8, rows: 2 } },
      grid,
      [],
      [strip],
    );
    expect(rejection?.field).toBe("name");
  });

  it("refuses an area that runs off the page", () => {
    const rejection = checkReservation(
      { name: "לוגו", rect: { col: 6, row: 0, cols: 4, rows: 2 } },
      grid,
      [],
      [quarter, strip],
    );
    expect(rejection?.field).toBe("area");
  });

  it("refuses two areas that overlap, and says how big the other one is", () => {
    const rejection = checkReservation(
      { name: "לוגו", rect: { col: 0, row: 1, cols: 8, rows: 2 } },
      grid,
      [{ col: 0, row: 0, cols: 8, rows: 2 }],
      [quarter, strip],
    );
    expect(rejection?.field).toBe("area");
    expect(rejection?.message).toContain("ס״מ");
  });

  it("holds the newspaper to rule 7א as well — no unsellable remainder", () => {
    // A band across the MIDDLE of the page leaves two three-row strips, and
    // nothing in this catalogue is three rows tall. The newspaper has just
    // given away space it can no longer sell, and did not mean to.
    const rejection = checkReservation(
      { name: "כותרת", rect: { col: 0, row: 3, cols: 8, rows: 2 } },
      grid,
      [],
      [quarter],
    );
    expect(rejection?.field).toBe("area");
    expect(rejection?.message).toContain("שאף צורה בקטלוג לא נכנסת בו");
  });
});

describe("what a reserved area does to a placement", () => {
  const ctx = (over: Partial<PlacementContext> = {}): PlacementContext => ({
    issue: { status: "in_layout", newspaperId: "np1", issueDate: "2026-09-10" },
    isAdmin: false,
    page: { allowedShapes: [quarter], reserved: [] },
    publication: {
      newspaperId: "np1",
      publicationDate: "2026-09-10",
      customerId: "cus1",
      shapeId: quarter.id,
    },
    advertisement: { customerId: "cus1", validationPassed: true, archived: false },
    shape: quarter,
    rect: { col: 0, row: 0, cols: 4, rows: 4 },
    grid,
    siblings: [],
    alreadyInIssue: false,
    duplicateOverrideApproved: false,
    ...over,
  });

  const masthead = {
    name: "כותרת העיתון",
    rect: { col: 0, row: 0, cols: 8, rows: 4 },
    assetKey: null,
  };

  it("refuses an ad on top of it, and names the area rather than blaming an ad", () => {
    const rejection = checkPlacement(
      ctx({ page: { allowedShapes: [quarter], reserved: [masthead] } }),
    );
    expect(rejection?.code).toBe("reserved");
    expect(rejection?.message).toContain("כותרת העיתון");
    expect(rejection?.rect).toEqual(masthead.rect);
  });

  it("still allows the rest of the page", () => {
    expect(
      checkPlacement(
        ctx({
          page: { allowedShapes: [quarter], reserved: [masthead] },
          rect: { col: 0, row: 4, cols: 4, rows: 4 },
        }),
      ),
    ).toBeNull();
  });

  it("counts as occupied for rule 7א, not merely as a hole", () => {
    // Half the page is reserved; only a quarter is sellable. An ad one column
    // in from the edge strands three columns beneath the masthead — the same
    // failure as stranding them beside another ad.
    const rejection = checkPlacement(
      ctx({
        page: { allowedShapes: [quarter], reserved: [masthead] },
        rect: { col: 1, row: 4, cols: 4, rows: 4 },
      }),
    );
    expect(rejection?.code).toBe("dead_space");
  });
});

describe("what the settings screen reports", () => {
  it("says how much of the page is not for sale", () => {
    expect(reservedShare([{ col: 0, row: 0, cols: 8, rows: 2 }], grid)).toBe(25);
    expect(reservedShare([], grid)).toBe(0);
  });

  it("labels an area in centimetres, the unit the masthead was designed in", () => {
    expect(shortSize({ col: 0, row: 0, cols: 8, rows: 2 }, grid)).toBe("16.0×4.0");
  });
});
