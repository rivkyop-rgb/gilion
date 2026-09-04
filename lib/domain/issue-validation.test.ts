import { describe, expect, it } from "vitest";

import {
  blockingSummary,
  isCloseable,
  validateIssue,
  type ValidationInput,
  type ValidationPlacement,
  type ValidationPublication,
} from "./issue-validation";

/**
 * Seven checks, each reached on its own.
 *
 * Every case here starts from `clean()` and breaks exactly one thing, because
 * the failure that matters is a check that only fires when another one already
 * has — and a fixture that is wrong in three ways cannot tell you that.
 */

const PAGES = [
  { id: "pg1", number: 1, pageTypeName: "שער", allowedShapeIds: ["sh_quarter", "sh_strip"] },
  { id: "pg2", number: 2, pageTypeName: "פנימי", allowedShapeIds: ["sh_quarter", "sh_full"] },
];

function placement(over: Partial<ValidationPlacement> = {}): ValidationPlacement {
  return {
    id: "pl1",
    pageId: "pg1",
    publicationId: "pub1",
    adShapeId: "sh_quarter",
    shapeName: "רבע עמוד",
    rect: { col: 0, row: 0, cols: 2, rows: 2 },
    customerName: "מאפיית לוי",
    duplicateApproved: false,
    publicationCustomerId: "cus1",
    ad: { name: "לוי.pdf", customerId: "cus1", status: "valid", validationStatus: "passed" },
    ...over,
  };
}

function publication(over: Partial<ValidationPublication> = {}): ValidationPublication {
  return { id: "pub1", customerName: "מאפיית לוי", shapeName: "רבע עמוד", placed: true, ...over };
}

/** One ad, on one page, correctly — and a second page that is not empty. */
function clean(): ValidationInput {
  return {
    pages: PAGES,
    placements: [
      placement(),
      placement({
        id: "pl2",
        pageId: "pg2",
        publicationId: "pub2",
        rect: { col: 0, row: 0, cols: 2, rows: 2 },
      }),
    ],
    publications: [publication(), publication({ id: "pub2" })],
  };
}

const kinds = (input: ValidationInput) => validateIssue(input).findings.map((f) => f.kind);

describe("a clean issue", () => {
  it("produces no findings at all and may be closed", () => {
    const report = validateIssue(clean());
    expect(report.findings).toEqual([]);
    expect(report.blockingCount).toBe(0);
    expect(isCloseable(report)).toBe(true);
    expect(blockingSummary(report)).toBeNull();
  });

  it("counts what was due and what got placed", () => {
    const report = validateIssue(clean());
    expect(report.plannedCount).toBe(2);
    expect(report.placedCount).toBe(2);
  });
});

describe("finding 1 — a publication planned for the date and not placed", () => {
  it("blocks, and names the publication rather than a page", () => {
    const input = clean();
    input.publications.push(publication({ id: "pub3", customerName: "פרחי דנה", placed: false }));

    const report = validateIssue(input);
    expect(kinds(input)).toContain("unplaced_publication");
    expect(isCloseable(report)).toBe(false);

    const finding = report.findings.find((f) => f.kind === "unplaced_publication")!;
    expect(finding.items).toHaveLength(1);
    // It is nowhere yet — which is the problem, so there is no page to link to.
    expect(finding.items[0]!.pageNumber).toBeNull();
    expect(finding.items[0]!.publicationId).toBe("pub3");
  });
});

describe("finding 2 — the ad on the page is not this customer's", () => {
  it("blocks when the ad has no customer at all", () => {
    const input = clean();
    input.placements[0]!.ad = { ...input.placements[0]!.ad!, customerId: null };
    expect(kinds(input)).toContain("ad_without_customer");
  });

  it("blocks when the ad belongs to somebody else", () => {
    const input = clean();
    input.placements[0]!.ad = { ...input.placements[0]!.ad!, customerId: "cus9" };

    const finding = validateIssue(input).findings.find((f) => f.kind === "ad_without_customer")!;
    expect(finding.items[0]!.label).toContain("לקוח אחר");
    expect(finding.items[0]!.pageNumber).toBe(1);
  });
});

describe("finding 3 — the file itself", () => {
  it("blocks an archived ad", () => {
    const input = clean();
    input.placements[0]!.ad = { ...input.placements[0]!.ad!, status: "archived" };
    expect(kinds(input)).toContain("ad_unusable");
  });

  it("blocks an ad that never passed validation", () => {
    const input = clean();
    input.placements[0]!.ad = { ...input.placements[0]!.ad!, validationStatus: "failed" };
    expect(kinds(input)).toContain("ad_unusable");
  });

  it("blocks a placement with no ad row behind it", () => {
    const input = clean();
    input.placements[0]!.ad = null;
    expect(kinds(input)).toContain("ad_unusable");
  });
});

describe("finding 4 — the same publication twice", () => {
  it("blocks, and lists both placements", () => {
    const input = clean();
    input.placements.push(
      placement({ id: "pl3", pageId: "pg2", rect: { col: 4, row: 4, cols: 2, rows: 2 } }),
    );

    const finding = validateIssue(input).findings.find((f) => f.kind === "duplicate_placement")!;
    expect(finding.items).toHaveLength(2);
    expect(finding.items.map((i) => i.placementId)).toEqual(["pl1", "pl3"]);
  });

  it("does not block once every copy carries an approved override (FR-16)", () => {
    const input = clean();
    input.placements[0]!.duplicateApproved = true;
    input.placements.push(
      placement({
        id: "pl3",
        pageId: "pg2",
        rect: { col: 4, row: 4, cols: 2, rows: 2 },
        duplicateApproved: true,
      }),
    );
    expect(kinds(input)).not.toContain("duplicate_placement");
  });
});

describe("finding 5 — overlapping rectangles on one page", () => {
  it("blocks when two ads share a cell", () => {
    const input = clean();
    input.placements.push(
      placement({
        id: "pl3",
        publicationId: "pub3",
        pageId: "pg1",
        rect: { col: 1, row: 1, cols: 2, rows: 2 },
      }),
    );
    input.publications.push(publication({ id: "pub3" }));
    expect(kinds(input)).toContain("overlap");
  });

  it("leaves two ads that merely touch alone — the half-open rule (conventions §4)", () => {
    const input = clean();
    input.placements.push(
      placement({
        id: "pl3",
        publicationId: "pub3",
        pageId: "pg1",
        rect: { col: 2, row: 0, cols: 2, rows: 2 },
      }),
    );
    input.publications.push(publication({ id: "pub3" }));
    expect(kinds(input)).not.toContain("overlap");
  });

  it("does not compare rectangles across different pages", () => {
    const input = clean();
    // pl1 on page 1 and pl2 on page 2 already occupy the same coordinates.
    expect(kinds(input)).not.toContain("overlap");
  });
});

describe("finding 6 — a shape the page type does not allow", () => {
  it("blocks, and says which shape on which page type", () => {
    const input = clean();
    input.placements[0]!.adShapeId = "sh_full";
    input.placements[0]!.shapeName = "עמוד מלא";

    const finding = validateIssue(input).findings.find((f) => f.kind === "shape_not_allowed")!;
    expect(finding.items[0]!.label).toContain("עמוד מלא");
    expect(finding.items[0]!.label).toContain("שער");
  });
});

describe("finding 7 — a page with nothing on it", () => {
  it("warns and does NOT block: an editorial page is a legitimate page", () => {
    const input = clean();
    input.placements = input.placements.filter((p) => p.pageId !== "pg2");
    input.publications = [publication()];

    const report = validateIssue(input);
    const finding = report.findings.find((f) => f.kind === "empty_page")!;
    expect(finding.severity).toBe("warning");
    expect(report.blockingCount).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(isCloseable(report)).toBe(true);
  });
});

describe("the summary on a disabled close button", () => {
  it("names every blocking group and how many are in it", () => {
    const input = clean();
    input.publications.push(publication({ id: "pub3", placed: false }));
    input.placements[0]!.ad = null;

    const summary = blockingSummary(validateIssue(input))!;
    expect(summary).toContain("(1)");
    // Two different groups, and the warning is not among them.
    expect(summary.split("·")).toHaveLength(2);
  });
});
