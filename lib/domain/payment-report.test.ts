import { describe, expect, it } from "vitest";

import { coverageByPayment, coveragePhrase } from "./payment-report";

describe("coverageByPayment", () => {
  const slices = [
    { id: "oct", orderId: "o", price: 160, date: "2026-10-29", ran: true },
    { id: "n5", orderId: "o", price: 160, date: "2026-11-05", ran: false },
    { id: "n12", orderId: "o", price: 160, date: "2026-11-12", ran: false },
    { id: "n19", orderId: "o", price: 160, date: "2026-11-19", ran: false },
  ];
  it("spends one payment down the same queue the shares use", () => {
    const cover = coverageByPayment(slices, [{ id: "p", orderId: "o", amount: 400, date: "2026-10-25" }]);
    expect(cover.get("p")!.map((l) => [l.sliceId, l.amount])).toEqual([
      ["oct", 160],
      ["n5", 160],
      ["n12", 80],
    ]);
    const day = (d: Date | string) => String(d).slice(5);
    expect(coveragePhrase(cover.get("p")!, day, (n) => `₪${n}`)).toBe(
      "כיסה את 10-29 ו־11-05 במלואם, ו־₪80 מתוך 11-12",
    );
  });
  it("a second payment picks up where the first stopped", () => {
    const cover = coverageByPayment(slices, [
      { id: "a", orderId: "o", amount: 200, date: "2026-10-01" },
      { id: "b", orderId: "o", amount: 200, date: "2026-11-01" },
    ]);
    expect(cover.get("b")!.map((l) => [l.sliceId, l.amount])).toEqual([
      ["n5", 120],
      ["n12", 80],
    ]);
  });
});
