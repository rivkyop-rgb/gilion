import { afterAll, describe, expect, it } from "vitest";

import { basePrisma } from "./db";
import { createIssue, getIssue, gridOfIssue } from "./issues";
import { gridOf } from "./newspapers";

/**
 * conventions.md §7 rule 2 / FR-17, asserted against what is stored.
 *
 * The rule is easy to state and easy to lose: an issue keeps the page division
 * it was opened with. It is easy to lose because reading `Newspaper` is the
 * obvious thing to do at every call site, and the failure is silent — nothing
 * errors, the ads simply move on a layout somebody already signed off.
 *
 * So the test does the thing that would break it: opens an issue, then changes
 * the newspaper underneath it.
 */
const BUSINESS = "biz_alpha";
const DATE = "2027-04-07";

let issueId = "";
let original: { columns: number; row_height_mm: unknown } | null = null;

afterAll(async () => {
  if (issueId) {
    await basePrisma.issuePage.deleteMany({ where: { issue_id: issueId } });
    await basePrisma.issue.deleteMany({ where: { id: issueId } });
  }
  if (original) {
    await basePrisma.newspaper.update({
      where: { id: "paper_alpha" },
      data: { columns: original.columns, row_height_mm: original.row_height_mm as number },
    });
  }
});

describe("the grid an issue is opened with", () => {
  it("survives a later change to the newspaper's page division", async () => {
    const paper = await basePrisma.newspaper.findUniqueOrThrow({ where: { id: "paper_alpha" } });
    original = { columns: paper.columns, row_height_mm: paper.row_height_mm };
    const before = gridOf(paper)!;

    const issue = await createIssue(BUSINESS, {
      newspaperId: "paper_alpha",
      date: DATE,
      pageTypeIds: ["pt_inner"],
    });
    issueId = issue.id;

    // The snapshot matches the newspaper at the moment of opening.
    expect(gridOfIssue(issue)!.columns).toBe(before.columns);
    expect(gridOfIssue(issue)!.rows).toBe(before.rows);

    // Now re-column the newspaper — the thing a publisher is entitled to do.
    await basePrisma.newspaper.update({
      where: { id: "paper_alpha" },
      data: { columns: 12, row_height_mm: 20 },
    });

    const changed = gridOf(
      await basePrisma.newspaper.findUniqueOrThrow({ where: { id: "paper_alpha" } }),
    )!;
    expect(changed.columns).toBe(12);
    expect(changed.rows).not.toBe(before.rows);

    // The issue has not moved.
    const reread = await getIssue(BUSINESS, issueId);
    const after = gridOfIssue(reread!)!;
    expect(after.columns).toBe(before.columns);
    expect(after.rows).toBe(before.rows);
    expect(after.columnWidthMm).toBeCloseTo(before.columnWidthMm, 6);
  });
});
