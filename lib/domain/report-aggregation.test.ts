import { describe, expect, it } from "vitest";

import {
  buildReport,
  monthOf,
  resolvePeriod,
  shiftPeriod,
  weekOf,
  type ReportOrder,
  type ReportPublication,
} from "./payment-report";
import { lensCounts, matchesLens, type ReportablePublication } from "./publication-report";

describe("weekOf", () => {
  it("runs Sunday to Saturday around the given day", () => {
    // 2026-09-14 is a Monday.
    expect(weekOf(new Date("2026-09-14T00:00:00Z"))).toEqual({
      from: "2026-09-13",
      to: "2026-09-19",
    });
  });

  it("keeps a Sunday in its own week rather than the previous one", () => {
    expect(weekOf(new Date("2026-09-13T00:00:00Z")).from).toBe("2026-09-13");
  });

  it("crosses a month boundary without clipping", () => {
    // 2026-10-01 is a Thursday; its week starts in September.
    expect(weekOf(new Date("2026-10-01T00:00:00Z"))).toEqual({
      from: "2026-09-27",
      to: "2026-10-03",
    });
  });
});

describe("monthOf", () => {
  it("covers the whole calendar month", () => {
    expect(monthOf(new Date("2026-09-14T00:00:00Z"))).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("gets February right, leap year included", () => {
    expect(monthOf(new Date("2028-02-10T00:00:00Z")).to).toBe("2028-02-29");
    expect(monthOf(new Date("2027-02-10T00:00:00Z")).to).toBe("2027-02-28");
  });
});

describe("resolvePeriod", () => {
  it("hands back a custom range verbatim, half-open included", () => {
    expect(resolvePeriod("custom", "", { from: "2026-01-01", to: "" })).toEqual({
      from: "2026-01-01",
      to: "",
    });
  });

  it("falls back to today when the anchor is missing or unparsable", () => {
    const today = new Date("2026-09-14T00:00:00Z");
    expect(resolvePeriod("month", "", undefined, today).from).toBe("2026-09-01");
    expect(resolvePeriod("month", "not-a-date", undefined, today).from).toBe("2026-09-01");
  });
});

describe("shiftPeriod", () => {
  it("steps a week by seven days and a month by one month", () => {
    expect(shiftPeriod("week", "2026-09-13", -1)).toBe("2026-09-06");
    expect(shiftPeriod("month", "2026-09-01", 1)).toBe("2026-10-01");
  });

  it("leaves a custom range alone — it has no neighbours", () => {
    expect(shiftPeriod("custom", "2026-09-13", 1)).toBe("2026-09-13");
  });
});

// ---------------------------------------------------------------------------

const pub = (
  customerId: string,
  orderId: string,
  price: number,
  status = "published",
): ReportPublication => ({
  customerId,
  customerLabel: `לקוח ${customerId}`,
  newspaperId: "paper_alpha",
  orderId,
  price,
  status,
});

const paid = (orderId: string, paidAmount: number, invoiceNumbers: string[] = []): ReportOrder => ({
  orderId,
  paidAmount,
  invoiceNumbers,
});

describe("buildReport", () => {
  it("is empty for a period with nothing in it", () => {
    const { rows, totals } = buildReport([], [], new Map());
    expect(rows).toEqual([]);
    expect(totals.billed).toBe(0);
    expect(totals.customersInDebt).toBe(0);
  });

  it("gives every customer one row with billed, paid and outstanding", () => {
    const { rows } = buildReport(
      [pub("c1", "o1", 1000), pub("c1", "o1", 500), pub("c2", "o2", 800)],
      [paid("o1", 600), paid("o2", 800)],
      new Map([
        ["o1", 1500],
        ["o2", 800],
      ]),
    );

    expect(rows).toHaveLength(2);
    const c1 = rows.find((r) => r.customerId === "c1")!;
    expect(c1.billed).toBe(1500);
    expect(c1.paid).toBe(600);
    expect(c1.outstanding).toBe(900);
    expect(c1.publicationCount).toBe(2);

    const c2 = rows.find((r) => r.customerId === "c2")!;
    expect(c2.outstanding).toBe(0);
  });

  it("does not bill for a cancelled publication", () => {
    const { rows } = buildReport(
      [pub("c1", "o1", 1000), pub("c1", "o1", 400, "canceled")],
      [paid("o1", 0)],
      new Map([["o1", 1000]]),
    );
    expect(rows[0]!.billed).toBe(1000);
    expect(rows[0]!.publicationCount).toBe(1);
  });

  it("apportions one payment across the weeks its order actually covers", () => {
    // Four insertions of 250 on one order, paid in full. A single week must
    // show a quarter of the payment, not all of it and not none.
    const orderTotals = new Map([["o1", 1000]]);
    const oneWeek = buildReport([pub("c1", "o1", 250)], [paid("o1", 1000)], orderTotals);
    expect(oneWeek.rows[0]!.billed).toBe(250);
    expect(oneWeek.rows[0]!.paid).toBe(250);
    expect(oneWeek.rows[0]!.outstanding).toBe(0);

    const halfPaid = buildReport([pub("c1", "o1", 250)], [paid("o1", 500)], orderTotals);
    expect(halfPaid.rows[0]!.paid).toBe(125);
    expect(halfPaid.rows[0]!.outstanding).toBe(125);
  });

  it("never reports more paid than billed, even on an overpaid order", () => {
    const { rows, totals } = buildReport(
      [pub("c1", "o1", 500)],
      [paid("o1", 900)],
      new Map([["o1", 500]]),
    );
    expect(rows[0]!.paid).toBe(500);
    expect(rows[0]!.outstanding).toBe(0);
    expect(totals.paid).toBe(500);
  });

  it("lists each invoice number once, however many publications share the order", () => {
    const { rows } = buildReport(
      [pub("c1", "o1", 100), pub("c1", "o1", 100), pub("c1", "o2", 100)],
      [paid("o1", 0, ["INV-1"]), paid("o2", 0, ["INV-1", "INV-2"])],
      new Map([
        ["o1", 200],
        ["o2", 100],
      ]),
    );
    expect(rows[0]!.invoiceNumbers).toEqual(["INV-1", "INV-2"]);
  });

  it("attributes nothing from an order that billed nothing", () => {
    // A zero-total order has no proportion to divide by; the guard must not
    // produce NaN and quietly poison every total on the page.
    const { rows, totals } = buildReport(
      [pub("c1", "o1", 0)],
      [paid("o1", 400)],
      new Map([["o1", 0]]),
    );
    expect(rows[0]!.paid).toBe(0);
    expect(Number.isNaN(totals.paid)).toBe(false);
  });

  it("sorts the biggest debtor first — the reason anyone opens this report", () => {
    const { rows } = buildReport(
      [pub("c1", "o1", 100), pub("c2", "o2", 900)],
      [paid("o1", 0), paid("o2", 0)],
      new Map([
        ["o1", 100],
        ["o2", 900],
      ]),
    );
    expect(rows.map((r) => r.customerId)).toEqual(["c2", "c1"]);
  });

  it("totals what the rows show, including how many customers owe", () => {
    const { totals } = buildReport(
      [pub("c1", "o1", 1000), pub("c2", "o2", 500)],
      [paid("o1", 1000), paid("o2", 100)],
      new Map([
        ["o1", 1000],
        ["o2", 500],
      ]),
    );
    expect(totals.billed).toBe(1500);
    expect(totals.paid).toBe(1100);
    expect(totals.outstanding).toBe(400);
    expect(totals.customersInDebt).toBe(1);
    expect(totals.publicationCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------

const row = (over: Partial<ReportablePublication>): ReportablePublication => ({
  status: "placed",
  placementStatus: "placed",
  paymentStatus: "unpaid",
  hasAdvertisement: true,
  ...over,
});

describe("the four questions of US-010", () => {
  it("'who is running' is everything not cancelled", () => {
    expect(matchesLens(row({ status: "planned" }), "running")).toBe(true);
    expect(matchesLens(row({ status: "canceled" }), "running")).toBe(false);
  });

  it("'who is missing artwork' is about the file, not the status", () => {
    expect(matchesLens(row({ hasAdvertisement: false }), "missing_ad")).toBe(true);
    expect(matchesLens(row({ hasAdvertisement: true }), "missing_ad")).toBe(false);
    expect(matchesLens(row({ hasAdvertisement: false, status: "canceled" }), "missing_ad")).toBe(
      false,
    );
  });

  it("'who is not laid out' ignores what has already run", () => {
    expect(matchesLens(row({ placementStatus: "not_placed", status: "planned" }), "unplaced")).toBe(
      true,
    );
    // A published ad has no placement left to chase.
    expect(
      matchesLens(row({ placementStatus: "not_placed", status: "published" }), "unplaced"),
    ).toBe(false);
  });

  it("'who owes money' is exactly published-and-not-paid", () => {
    expect(matchesLens(row({ status: "published", paymentStatus: "debt" }), "owing")).toBe(true);
    expect(matchesLens(row({ status: "published", paymentStatus: "paid" }), "owing")).toBe(false);
    // Not yet printed is not yet owed.
    expect(matchesLens(row({ status: "placed", paymentStatus: "unpaid" }), "owing")).toBe(false);
  });

  it("counts every chip in one pass over the rows", () => {
    const counts = lensCounts([
      row({ status: "published", paymentStatus: "debt" }),
      row({ status: "planned", hasAdvertisement: false, placementStatus: "not_placed" }),
      row({ status: "canceled" }),
    ]);
    expect(counts.all).toBe(3);
    expect(counts.running).toBe(2);
    expect(counts.missing_ad).toBe(1);
    expect(counts.unplaced).toBe(1);
    expect(counts.owing).toBe(1);
  });
});
