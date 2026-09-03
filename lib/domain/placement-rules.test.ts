import { describe, expect, it } from "vitest";

import { deriveGrid, type DerivedGrid } from "./grid";
import {
  checkPlacement,
  deadSpaceCreatedBy,
  sizeLabel,
  type PlacementContext,
  type ShapeSpec,
} from "./placement";
import type { GridRect } from "./slot-geometry";

/**
 * A small, exactly divisible grid: 8 columns x 8 rows, no gutter.
 *
 * Round numbers on purpose — every dead-space assertion below is arithmetic a
 * reader can do in their head, which is what makes a failure readable.
 */
const grid: DerivedGrid = deriveGrid({
  pageSize: "custom",
  customWidthMm: 180,
  customHeightMm: 180,
  marginMm: 10,
  columns: 8,
  rowHeightMm: 20,
  gutterMm: 0,
})!;

const quarter: ShapeSpec = { id: "sh_q", name: "רבע עמוד", cols: 4, rows: 4, positions: null };
const half: ShapeSpec = { id: "sh_h", name: "חצי עמוד", cols: 8, rows: 4, positions: null };
const strip: ShapeSpec = {
  id: "sh_s",
  name: "רצועה תחתונה",
  cols: 8,
  rows: 2,
  // Only flush with the foot of the page — the worked example from base-shapes.
  positions: [[0, 6]],
};

function ctx(over: Partial<PlacementContext> = {}): PlacementContext {
  return {
    issue: { status: "in_layout", newspaperId: "np1", issueDate: "2026-09-10" },
    isAdmin: false,
    page: { allowedShapes: [quarter, half], reserved: [] },
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
  };
}

describe("rule 1 — the issue must be open (FR-6)", () => {
  it("refuses every placement on a closed issue, admin included", () => {
    const rejection = checkPlacement(
      ctx({
        issue: { status: "closed", newspaperId: "np1", issueDate: "2026-09-10" },
        isAdmin: true,
      }),
    );
    expect(rejection?.code).toBe("issue_locked");
    expect(rejection?.message).toContain("גיליון סגור");
  });

  it("refuses a designer on ready_for_print but allows an admin", () => {
    const issue = {
      status: "ready_for_print" as const,
      newspaperId: "np1",
      issueDate: "2026-09-10",
    };
    expect(checkPlacement(ctx({ issue }))?.code).toBe("issue_locked");
    expect(checkPlacement(ctx({ issue, isAdmin: true }))).toBeNull();
  });
});

describe("rules 2 — the publication must belong to this issue", () => {
  it("refuses another newspaper's publication", () => {
    const rejection = checkPlacement(
      ctx({
        publication: {
          newspaperId: "np2",
          publicationDate: "2026-09-10",
          customerId: "cus1",
          shapeId: quarter.id,
        },
      }),
    );
    expect(rejection?.code).toBe("wrong_newspaper");
  });

  it("refuses another date's publication", () => {
    const rejection = checkPlacement(
      ctx({
        publication: {
          newspaperId: "np1",
          publicationDate: "2026-09-17",
          customerId: "cus1",
          shapeId: quarter.id,
        },
      }),
    );
    expect(rejection?.code).toBe("wrong_date");
  });
});

describe("rules 3-4 — the artwork (US-005 AC-4)", () => {
  it("refuses a publication with no ad at all", () => {
    expect(checkPlacement(ctx({ advertisement: null }))?.code).toBe("ad_missing");
  });

  it("refuses an ad with no customer", () => {
    const rejection = checkPlacement(
      ctx({ advertisement: { customerId: null, validationPassed: true, archived: false } }),
    );
    expect(rejection?.code).toBe("ad_missing_customer");
  });

  it("refuses an ad belonging to a different customer", () => {
    const rejection = checkPlacement(
      ctx({ advertisement: { customerId: "cus2", validationPassed: true, archived: false } }),
    );
    expect(rejection?.code).toBe("ad_customer_mismatch");
  });

  it("refuses an ad that failed validation", () => {
    const rejection = checkPlacement(
      ctx({ advertisement: { customerId: "cus1", validationPassed: false, archived: false } }),
    );
    expect(rejection?.code).toBe("ad_not_validated");
  });

  it("refuses an archived ad", () => {
    const rejection = checkPlacement(
      ctx({ advertisement: { customerId: "cus1", validationPassed: true, archived: true } }),
    );
    expect(rejection?.code).toBe("ad_not_validated");
  });
});

describe("rule 5 — the shape must be allowed on the page type (US-007 AC-3)", () => {
  it("refuses a shape the page type does not list, and names it", () => {
    const rejection = checkPlacement(ctx({ page: { allowedShapes: [half], reserved: [] } }));
    expect(rejection?.code).toBe("shape_not_allowed_on_page");
    expect(rejection?.message).toContain("רבע עמוד");
  });
});

describe("rule 6 — bounds and footprint", () => {
  it("refuses a rectangle hanging off the page", () => {
    expect(checkPlacement(ctx({ rect: { col: 6, row: 0, cols: 4, rows: 4 } }))?.code).toBe(
      "out_of_bounds",
    );
  });

  it("refuses a rectangle that is not the shape's own size", () => {
    const rejection = checkPlacement(ctx({ rect: { col: 0, row: 0, cols: 2, rows: 4 } }));
    expect(rejection?.code).toBe("size_mismatch");
    // The message is in centimetres, never in cells (conventions.md §1).
    expect(rejection?.message).toContain("ס״מ");
    expect(rejection?.message).not.toContain("תא");
  });
});

describe("rule 7 — an explicit allowed region", () => {
  const withStrip = {
    page: { allowedShapes: [quarter, half, strip], reserved: [] },
    shape: strip,
    publication: {
      newspaperId: "np1",
      publicationDate: "2026-09-10",
      customerId: "cus1",
      shapeId: strip.id,
    },
  };

  it("refuses the strip at the top of the page", () => {
    const rejection = checkPlacement(
      ctx({ ...withStrip, rect: { col: 0, row: 0, cols: 8, rows: 2 } }),
    );
    expect(rejection?.code).toBe("outside_region");
  });

  it("accepts the strip flush with the foot", () => {
    expect(
      checkPlacement(ctx({ ...withStrip, rect: { col: 0, row: 6, cols: 8, rows: 2 } })),
    ).toBeNull();
  });
});

describe("rule 8 — occupied space", () => {
  it("refuses an overlap and reports the rectangle in the way", () => {
    const other: GridRect = { col: 2, row: 2, cols: 4, rows: 4 };
    const rejection = checkPlacement(ctx({ siblings: [other] }));
    expect(rejection?.code).toBe("overlap");
    expect(rejection?.rect).toEqual(other);
  });

  it("allows two placements that merely touch at the edge", () => {
    expect(
      checkPlacement(
        ctx({
          rect: { col: 4, row: 0, cols: 4, rows: 4 },
          siblings: [{ col: 0, row: 0, cols: 4, rows: 4 }],
        }),
      ),
    ).toBeNull();
  });
});

describe("rule 7א — no dead remainders (decision of 25/08/2026)", () => {
  it("refuses a placement that strands space nothing fits into", () => {
    // Only a 4x4 quarter is sellable here. An ad one column in from the right
    // edge leaves two unsellable remainders: a single column at col 0, and a
    // three-column band at cols 5-7. The rejection points at the larger one,
    // which is the one the designer needs to see.
    const rejection = checkPlacement(
      ctx({
        page: { allowedShapes: [quarter], reserved: [] },
        rect: { col: 1, row: 0, cols: 4, rows: 4 },
      }),
    );
    expect(rejection?.code).toBe("dead_space");
    expect(rejection?.message).toContain("ס״מ");
    expect(rejection?.rect).toEqual({ col: 5, row: 0, cols: 3, rows: 4 });
  });

  it("accepts the same ad once it is moved flush to the edge", () => {
    expect(
      checkPlacement(
        ctx({
          page: { allowedShapes: [quarter], reserved: [] },
          rect: { col: 0, row: 0, cols: 4, rows: 4 },
        }),
      ),
    ).toBeNull();
  });

  it("blames only the remainder the placement created", () => {
    // The page is already awkward: a lone free column exists before this ad is
    // placed anywhere. Refusing here would leave an issue nobody can finish.
    const preexisting: GridRect = { col: 1, row: 0, cols: 4, rows: 8 };
    expect(
      deadSpaceCreatedBy({ col: 5, row: 0, cols: 3, rows: 8 }, [preexisting], grid, [
        { id: "x", name: "x", cols: 3, rows: 8, positions: null },
      ]),
    ).toBeNull();
  });

  it("says nothing when the page type has no catalogue to measure against", () => {
    expect(deadSpaceCreatedBy({ col: 1, row: 0, cols: 4, rows: 4 }, [], grid, [])).toBeNull();
  });
});

describe("rule 9 — one placement per publication per issue (FR-16)", () => {
  it("refuses the second placement", () => {
    expect(checkPlacement(ctx({ alreadyInIssue: true }))?.code).toBe("duplicate");
  });

  it("lets an approved override through", () => {
    expect(
      checkPlacement(ctx({ alreadyInIssue: true, duplicateOverrideApproved: true })),
    ).toBeNull();
  });
});

describe("the unit every message speaks", () => {
  it("measures a footprint in centimetres", () => {
    // 8 columns across 160 mm of usable width = 20 mm each; 4 of them = 8.0 cm.
    expect(sizeLabel({ cols: 4, rows: 4 }, grid)).toBe("8.0 × 8.0 ס״מ");
  });
});
