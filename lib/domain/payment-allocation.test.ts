import { describe, expect, it } from "vitest";

import {
  allocatePayment,
  describeAllocation,
  positionLabel,
  positionOf,
  type OpenOrder,
} from "./payment-allocation";

const order = (orderId: string, open: number, day: number): OpenOrder => ({
  orderId,
  open,
  createdAt: new Date(`2026-03-${String(day).padStart(2, "0")}T00:00:00Z`),
});

describe("allocatePayment", () => {
  it("settles one order exactly, with nothing left", () => {
    const r = allocatePayment(500, [order("a", 500, 1)]);
    expect(r.allocations).toEqual([{ orderId: "a", amount: 500 }]);
    expect(r.leftover).toBe(0);
  });

  it("walks the open orders oldest first", () => {
    const r = allocatePayment(1000, [order("newer", 800, 10), order("older", 600, 1)]);
    expect(r.allocations).toEqual([
      { orderId: "older", amount: 600 },
      { orderId: "newer", amount: 400 },
    ]);
    expect(r.leftover).toBe(0);
  });

  it("leaves the last order partly open when the money runs out", () => {
    const r = allocatePayment(700, [order("a", 500, 1), order("b", 500, 2)]);
    expect(r.allocations).toEqual([
      { orderId: "a", amount: 500 },
      { orderId: "b", amount: 200 },
    ]);
    expect(r.leftover).toBe(0);
  });

  it("never gives an order more than is open on it", () => {
    // The surplus is the customer's credit, not an overpayment on whichever
    // order happened to be last in the queue.
    const r = allocatePayment(1000, [order("a", 300, 1)]);
    expect(r.allocations).toEqual([{ orderId: "a", amount: 300 }]);
    expect(r.leftover).toBe(700);
  });

  it("is all credit when there is no open debt at all", () => {
    const r = allocatePayment(250, []);
    expect(r.allocations).toEqual([]);
    expect(r.leftover).toBe(250);
  });

  it("skips orders that are already settled", () => {
    const r = allocatePayment(100, [order("paid", 0, 1), order("open", 100, 2)]);
    expect(r.allocations).toEqual([{ orderId: "open", amount: 100 }]);
  });

  it("keeps two decimals and still adds up", () => {
    const r = allocatePayment(100.05, [order("a", 33.35, 1), order("b", 33.35, 2)]);
    const total = r.allocations.reduce((s, a) => s + a.amount, 0) + r.leftover;
    expect(Math.round(total * 100) / 100).toBe(100.05);
    expect(r.leftover).toBe(33.35);
  });

  it("does nothing with a non-positive amount", () => {
    expect(allocatePayment(0, [order("a", 500, 1)]).allocations).toEqual([]);
    expect(allocatePayment(-10, [order("a", 500, 1)]).leftover).toBe(0);
  });

  it("is deterministic when two orders share a date", () => {
    const same = new Date("2026-03-01T00:00:00Z");
    const a = { orderId: "aaa", open: 100, createdAt: same };
    const b = { orderId: "bbb", open: 100, createdAt: same };
    expect(allocatePayment(100, [b, a]).allocations).toEqual([{ orderId: "aaa", amount: 100 }]);
  });
});

describe("describeAllocation", () => {
  const label = (id: string) => `ORD-${id.toUpperCase()}`;

  it("says which single order will be settled", () => {
    const text = describeAllocation(allocatePayment(500, [order("a", 500, 1)]), label);
    expect(text).toContain("ORD-A");
    expect(text).not.toContain("יתרת הלקוח");
  });

  it("names every order in a split, and the credit left over", () => {
    const text = describeAllocation(
      allocatePayment(1000, [order("a", 400, 1), order("b", 300, 2)]),
      label,
    );
    expect(text).toContain("2 הזמנות");
    expect(text).toContain("ORD-A");
    expect(text).toContain("ORD-B");
    expect(text).toContain("יתרת הלקוח");
  });

  it("says so plainly when there is nothing open to settle", () => {
    expect(describeAllocation(allocatePayment(250, []), label)).toContain("אין כרגע חוב פתוח");
  });
});

describe("positionOf", () => {
  it("keeps debt and credit apart instead of netting them away", () => {
    // Owing 500 on a published ad while holding 500 credit is not a clean
    // sheet: one of those needs a phone call and the other does not.
    const p = positionOf(500, 500);
    expect(p.outstanding).toBe(500);
    expect(p.credit).toBe(500);
    expect(p.net).toBe(0);
  });

  it("goes negative when the customer is ahead", () => {
    expect(positionOf(0, 300).net).toBe(-300);
  });
});

describe("positionLabel", () => {
  it("names which side the balance falls on", () => {
    expect(positionLabel(300)).toBe("יתרה לחובה");
    expect(positionLabel(-300)).toBe("יתרה לזכות");
    expect(positionLabel(0)).toBe("מאוזן");
  });
});
