import { describe, expect, it } from "vitest";

import { allocateOrderPayments } from "./payment-report";
import { summariseAccount } from "./customer-account";

// 08/11/2026 — the habodek run: ₪1,000 on a ten-week order closed ₪100 of the
// week that had already printed, and the printed week stayed "debt".
const weeks = [
  { id: "w1", orderId: "o", price: 1870, date: "2026-11-19", ran: true },
  { id: "w2", orderId: "o", price: 1870, date: "2026-11-26", ran: false },
  { id: "w3", orderId: "o", price: 1870, date: "2026-12-03", ran: false },
];

describe("allocateOrderPayments", () => {
  it("covers what already printed before anything still to come", () => {
    const shares = allocateOrderPayments(weeks, new Map([["o", 1000]]));
    expect(shares.get("w1")).toBe(1000);
    expect(shares.get("w2")).toBe(0);
    expect(shares.get("w3")).toBe(0);
  });

  it("then the oldest of what is still to come", () => {
    const shares = allocateOrderPayments(weeks, new Map([["o", 2500]]));
    expect(shares.get("w1")).toBe(1870);
    expect(shares.get("w2")).toBe(630);
    expect(shares.get("w3")).toBe(0);
  });

  it("a printed week later in the calendar still comes before an unprinted earlier one", () => {
    const shares = allocateOrderPayments(
      [
        { id: "a", orderId: "o", price: 100, date: "2026-11-01", ran: false },
        { id: "b", orderId: "o", price: 100, date: "2026-11-08", ran: true },
      ],
      new Map([["o", 100]]),
    );
    expect(shares.get("b")).toBe(100);
    expect(shares.get("a")).toBe(0);
  });

  it("never gives a line more than its price, and nothing to an order with no payment", () => {
    const shares = allocateOrderPayments(weeks, new Map([["o", 99999]]));
    expect([...shares.values()]).toEqual([1870, 1870, 1870]);
    expect(allocateOrderPayments(weeks, new Map()).get("w1")).toBe(0);
  });

  it("the card then says the printed week is paid down, not ₪100 of it", () => {
    const shares = allocateOrderPayments(weeks, new Map([["o", 1000]]));
    const account = summariseAccount(
      weeks.map((w) => ({
        id: w.id,
        orderId: "o",
        orderStatus: "approved",
        status: w.ran ? "published" : "placed",
        price: w.price,
      })),
      new Map([["o", 1000]]),
      shares,
    );
    expect(account.ranOpen).toBe(870);
    expect(account.upcomingOpen).toBe(3740);
  });
});
