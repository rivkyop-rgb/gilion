import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { basePrisma } from "./db";
import { addIssuePage, createIssue, insertIssuePages, reorderIssuePages } from "./issues";

/**
 * Renumbering, asserted against the constraint that makes it hard.
 *
 * `@@unique([issue_id, page_number])` is checked per row and is not deferrable,
 * so the obvious implementation — "shift everything after this page up by one"
 * — fails on its second row. The bug it produces is not a wrong order but a
 * refused action, and it only appears once an issue has more than two pages,
 * which is exactly the case nobody tries by hand.
 */
const BUSINESS = "biz_alpha";
const DATE = "2027-05-11";

let issueId = "";

beforeEach(async () => {
  if (issueId) {
    await basePrisma.issuePage.deleteMany({ where: { issue_id: issueId } });
    await basePrisma.issue.deleteMany({ where: { id: issueId } });
  }
  const issue = await createIssue(BUSINESS, {
    newspaperId: "paper_alpha",
    date: DATE,
    pageTypeIds: ["pt_cover", "pt_inner", "pt_inner", "pt_back"],
  });
  issueId = issue.id;
});

afterAll(async () => {
  if (issueId) {
    await basePrisma.issuePage.deleteMany({ where: { issue_id: issueId } });
    await basePrisma.issue.deleteMany({ where: { id: issueId } });
  }
});

const numbers = async () =>
  (
    await basePrisma.issuePage.findMany({
      where: { issue_id: issueId },
      orderBy: { page_number: "asc" },
      select: { page_number: true, page_type_id: true },
    })
  ).map((p) => `${p.page_number}:${p.page_type_id}`);

describe("inserting a sheet at a seam", () => {
  it("adds a WHOLE SHEET — four pages — after the named page", async () => {
    // A saddle-stitched sheet is folded once and carries four pages. Adding two
    // used to be the rule and let an issue reach six pages, which cannot be
    // folded and stapled at all (PAGES_PER_SHEET, decided 07/09/2026).
    await insertIssuePages(BUSINESS, issueId, "pt_inner", await pageIdAt(2));

    expect(await numbers()).toEqual([
      "1:pt_cover",
      "2:pt_inner",
      "3:pt_inner",
      "4:pt_inner",
      "5:pt_inner",
      "6:pt_inner",
      "7:pt_inner",
      "8:pt_back",
    ]);
  });

  it("keeps the total foldable, which is the point of the number", async () => {
    await insertIssuePages(BUSINESS, issueId, "pt_inner", await pageIdAt(2));
    expect((await numbers()).length % 4).toBe(0);

    await insertIssuePages(BUSINESS, issueId, "pt_inner", await pageIdAt(2));
    expect((await numbers()).length % 4).toBe(0);
  });

  it("can insert straight after the cover", async () => {
    await insertIssuePages(BUSINESS, issueId, "pt_back", await pageIdAt(1));
    expect(await numbers()).toEqual([
      "1:pt_cover",
      "2:pt_back",
      "3:pt_back",
      "4:pt_back",
      "5:pt_back",
      "6:pt_inner",
      "7:pt_inner",
      "8:pt_back",
    ]);
  });

  it("leaves no gap and no duplicate after several inserts in a row", async () => {
    await insertIssuePages(BUSINESS, issueId, "pt_inner", await pageIdAt(1));
    await insertIssuePages(BUSINESS, issueId, "pt_inner", await pageIdAt(3));
    await insertIssuePages(BUSINESS, issueId, "pt_inner", await pageIdAt(2));

    const rows = await basePrisma.issuePage.findMany({
      where: { issue_id: issueId },
      orderBy: { page_number: "asc" },
      select: { page_number: true },
    });
    // 4 to start, three sheets of 4 added.
    expect(rows.map((r) => r.page_number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });
});

describe("reordering the strip", () => {
  it("applies the submitted order", async () => {
    const ids = await pageIds();
    await reorderIssuePages(BUSINESS, issueId, [ids[0]!, ids[2]!, ids[1]!, ids[3]!]);

    expect(await numbers()).toEqual(["1:pt_cover", "2:pt_inner", "3:pt_inner", "4:pt_back"]);
    const after = await pageIds();
    expect(after).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  });

  it("is idempotent — replaying the same order changes nothing", async () => {
    const ids = await pageIds();
    const order = [ids[3]!, ids[0]!, ids[1]!, ids[2]!];
    await reorderIssuePages(BUSINESS, issueId, order);
    const once = await pageIds();
    await reorderIssuePages(BUSINESS, issueId, order);
    expect(await pageIds()).toEqual(once);
  });

  it("keeps a page the submitted order forgot, rather than losing it", async () => {
    // What a stale tab sends after someone else added a page.
    const ids = await pageIds();
    await addIssuePage(BUSINESS, issueId, "pt_inner");

    await reorderIssuePages(BUSINESS, issueId, [ids[1]!, ids[0]!, ids[2]!, ids[3]!]);

    const rows = await basePrisma.issuePage.findMany({ where: { issue_id: issueId } });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.page_number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("ignores ids that belong to another issue", async () => {
    const ids = await pageIds();
    await reorderIssuePages(BUSINESS, issueId, ["not_a_page_of_this_issue", ...ids]);
    expect(await pageIds()).toEqual(ids);
  });
});

async function pageIds() {
  const rows = await basePrisma.issuePage.findMany({
    where: { issue_id: issueId },
    orderBy: { page_number: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function pageIdAt(pageNumber: number) {
  const row = await basePrisma.issuePage.findFirstOrThrow({
    where: { issue_id: issueId, page_number: pageNumber },
    select: { id: true },
  });
  return row.id;
}
