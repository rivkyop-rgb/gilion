import { describe, expect, it } from "vitest";

import {
  monthKeyOf,
  monthLabelOf,
  monthlyBreakdown,
  openMonthsPhrase,
  type MonthlyPublication,
} from "./payment-months";

const pub = (
  iso: string,
  price: number,
  orderId = "o1",
  status = "published",
): MonthlyPublication => ({ date: new Date(`${iso}T00:00:00Z`), price, orderId, status });

describe("monthKeyOf / monthLabelOf", () => {
  it("keys by calendar month in UTC", () => {
    expect(monthKeyOf(new Date("2028-03-07T00:00:00Z"))).toBe("2028-03");
  });

  it("names the month in Hebrew", () => {
    expect(monthLabelOf("2028-03")).toContain("מרץ");
    expect(monthLabelOf("2028-03")).toContain("2028");
  });

  it("does not slip a first-of-month into the month before", () => {
    // The whole point of formatting in UTC: 2028-04-01 stored midnight UTC is
    // still March in a negative offset, and the row would name the wrong month.
    expect(monthLabelOf(monthKeyOf(new Date("2028-04-01T00:00:00Z")))).toContain("אפריל");
  });
});

describe("monthlyBreakdown", () => {
  it("is empty for a customer with nothing", () => {
    const { months, totals } = monthlyBreakdown([], new Map(), new Map());
    expect(months).toEqual([]);
    expect(totals.open).toBe(0);
  });

  it("gives one row per month, oldest first", () => {
    const { months } = monthlyBreakdown(
      [pub("2028-04-04", 500), pub("2028-03-07", 300), pub("2028-03-14", 200)],
      new Map([["o1", 1000]]),
      new Map(),
    );
    expect(months.map((m) => m.key)).toEqual(["2028-03", "2028-04"]);
    expect(months[0]!.billed).toBe(500);
    expect(months[0]!.publicationCount).toBe(2);
    expect(months[1]!.billed).toBe(500);
  });

  it("splits one order's payment across the months it actually covers", () => {
    // 1,000 order over two months, 600 received: each month carries its share.
    const { months } = monthlyBreakdown(
      [pub("2028-03-07", 400), pub("2028-04-04", 600)],
      new Map([["o1", 1000]]),
      new Map([["o1", 600]]),
    );
    expect(months[0]!.paid).toBe(240);
    expect(months[0]!.open).toBe(160);
    expect(months[1]!.paid).toBe(360);
    expect(months[1]!.open).toBe(240);
  });

  it("keeps two orders in the same month apart in the arithmetic", () => {
    const { months } = monthlyBreakdown(
      [pub("2028-03-07", 500, "paid"), pub("2028-03-14", 500, "owing")],
      new Map([
        ["paid", 500],
        ["owing", 500],
      ]),
      new Map([["paid", 500]]),
    );
    expect(months).toHaveLength(1);
    expect(months[0]!.billed).toBe(1000);
    expect(months[0]!.paid).toBe(500);
    expect(months[0]!.open).toBe(500);
  });

  it("does not bill for a cancelled publication", () => {
    const { months } = monthlyBreakdown(
      [pub("2028-03-07", 500), pub("2028-03-14", 400, "o1", "canceled")],
      new Map([["o1", 500]]),
      new Map(),
    );
    expect(months[0]!.billed).toBe(500);
    expect(months[0]!.publicationCount).toBe(1);
  });

  it("never shows a month as more than fully paid", () => {
    const { months } = monthlyBreakdown(
      [pub("2028-03-07", 500)],
      new Map([["o1", 500]]),
      new Map([["o1", 900]]),
    );
    expect(months[0]!.paid).toBe(500);
    expect(months[0]!.open).toBe(0);
  });

  it("attributes nothing from an order that billed nothing", () => {
    const { months, totals } = monthlyBreakdown(
      [pub("2028-03-07", 0)],
      new Map([["o1", 0]]),
      new Map([["o1", 400]]),
    );
    expect(months[0]!.paid).toBe(0);
    expect(Number.isNaN(totals.paid)).toBe(false);
  });

  it("totals what the rows show", () => {
    const { totals } = monthlyBreakdown(
      [pub("2028-03-07", 400), pub("2028-04-04", 600)],
      new Map([["o1", 1000]]),
      new Map([["o1", 250]]),
    );
    expect(totals.billed).toBe(1000);
    expect(totals.paid).toBe(250);
    expect(totals.open).toBe(750);
  });
});

describe("openMonthsPhrase", () => {
  const month = (key: string, open: number) => ({
    key,
    label: monthLabelOf(key),
    billed: 100,
    paid: 100 - open,
    open,
    publicationCount: 1,
  });

  it("says so when nothing is open", () => {
    expect(openMonthsPhrase([month("2028-03", 0)])).toBe("אין חודש פתוח");
  });

  it("names one month", () => {
    expect(openMonthsPhrase([month("2028-03", 50)])).toContain("מרץ");
  });

  it("joins two with ו", () => {
    const text = openMonthsPhrase([month("2028-03", 50), month("2028-04", 50)]);
    expect(text).toContain("מרץ");
    expect(text).toContain("ואפריל");
  });

  it("counts instead of listing once it stops being a sentence", () => {
    const many = ["2028-01", "2028-02", "2028-03", "2028-04"].map((k) => month(k, 50));
    expect(openMonthsPhrase(many)).toContain("4 חודשים");
  });

  it("ignores months that are settled", () => {
    expect(openMonthsPhrase([month("2028-03", 0), month("2028-04", 50)])).toContain("אפריל");
    expect(openMonthsPhrase([month("2028-03", 0), month("2028-04", 50)])).not.toContain("מרץ");
  });
});
