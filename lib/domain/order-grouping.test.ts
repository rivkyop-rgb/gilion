import { describe, expect, it } from "vitest";

import { groupOrderLines, timesLabel, type GroupableLine } from "./order-grouping";

const line = (over: Partial<GroupableLine> = {}): GroupableLine => ({
  id: Math.random().toString(36).slice(2),
  newspaperName: "עיתון השבוע",
  pageTypeName: "פנימי",
  shapeName: "עמוד מלא",
  publicationDate: "2026-12-01",
  price: 1000,
  offSchedule: false,
  ...over,
});

describe("groupOrderLines", () => {
  it("collapses identical lines that differ only by date", () => {
    const groups = groupOrderLines([
      line({ publicationDate: "2026-12-01" }),
      line({ publicationDate: "2026-12-08" }),
      line({ publicationDate: "2026-12-15" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.times).toBe(3);
    expect(groups[0]!.subtotal).toBe(3000);
    expect(groups[0]!.lines).toHaveLength(3);
  });

  it("keeps different shapes apart", () => {
    const groups = groupOrderLines([line(), line({ shapeName: "חצי עמוד" })]);
    expect(groups).toHaveLength(2);
  });

  it("keeps different newspapers apart", () => {
    const groups = groupOrderLines([line(), line({ newspaperName: "קטלוג המרכז" })]);
    expect(groups).toHaveLength(2);
  });

  it("keeps the SAME size at two different prices apart", () => {
    // A discount on some of the dates is something that was agreed. Averaging
    // it away would hide it.
    const groups = groupOrderLines([line({ price: 1000 }), line({ price: 800 })]);
    expect(groups).toHaveLength(2);
    // Numeric comparator: a bare sort() would order these as strings.
    expect(groups.map((g) => g.unitPrice).sort((a, b) => a - b)).toEqual([800, 1000]);
  });

  it("flags the group when any single date is off-schedule", () => {
    const groups = groupOrderLines([line(), line({ offSchedule: true })]);
    expect(groups[0]!.hasOffSchedule).toBe(true);
  });

  it("has nothing to group in an empty order", () => {
    expect(groupOrderLines([])).toEqual([]);
  });

  it("preserves the order the dates arrived in", () => {
    const groups = groupOrderLines([
      line({ publicationDate: "2026-12-01" }),
      line({ publicationDate: "2026-12-08" }),
    ]);
    expect(groups[0]!.lines.map((l) => l.publicationDate)).toEqual(["2026-12-01", "2026-12-08"]);
  });

  it("the subtotals still add up to the order total", () => {
    const lines = [line({ price: 1000 }), line({ price: 1000 }), line({ price: 800 })];
    const groups = groupOrderLines(lines);
    const fromGroups = groups.reduce((sum, g) => sum + g.subtotal, 0);
    const fromLines = lines.reduce((sum, l) => sum + l.price, 0);
    expect(fromGroups).toBe(fromLines);
  });
});

describe("timesLabel", () => {
  it("reads naturally in Hebrew", () => {
    expect(timesLabel(1)).toBe("פעם אחת");
    expect(timesLabel(2)).toBe("פעמיים");
    expect(timesLabel(5)).toBe("5 פעמים");
  });
});
