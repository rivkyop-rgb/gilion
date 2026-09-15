import { describe, expect, it } from "vitest";

import { summariseAccount, type OrderForAccount } from "./customer-account";

const order = (
  status: string,
  totalPrice: number,
  paymentStatus: OrderForAccount["paymentStatus"],
  paidAmount = 0,
): OrderForAccount => ({ status, totalPrice, paymentStatus, paidAmount });

describe("summariseAccount", () => {
  it("is all zeroes for a customer with no orders", () => {
    const a = summariseAccount([]);
    expect(a.billed).toBe(0);
    expect(a.outstanding).toBe(0);
  });

  it("counts only binding orders towards the balance", () => {
    const a = summariseAccount([
      order("approved", 1000, "unpaid"),
      order("completed", 500, "paid", 500),
      // Neither of these is money anyone owes.
      order("draft", 9999, "unpaid"),
      order("rejected", 8888, "unpaid"),
      order("canceled", 7777, "unpaid"),
    ]);
    expect(a.billed).toBe(1500);
    expect(a.settled).toBe(500);
    expect(a.outstanding).toBe(1000);
    expect(a.notBinding).toBe(9999 + 8888 + 7777);
  });

  it("shows the exact part of a partially paid order that arrived", () => {
    // Before stage 08 there was no Payment entity, so the whole order had to be
    // counted as open. Now the amount is a fact and the split is real.
    const a = summariseAccount([order("approved", 1000, "partially_paid", 400)]);
    expect(a.settled).toBe(400);
    expect(a.outstanding).toBe(600);
    expect(a.inDebt).toBe(0);
  });

  it("counts only what is still open on a debt, not the whole order (FR-7)", () => {
    const a = summariseAccount([
      order("approved", 300, "unpaid"),
      order("approved", 700, "debt", 200),
    ]);
    expect(a.outstanding).toBe(800);
    expect(a.inDebt).toBe(500);
  });

  it("settled plus outstanding always accounts for everything billed", () => {
    const a = summariseAccount([
      order("approved", 1200, "unpaid"),
      order("approved", 800, "paid", 800),
      order("completed", 450, "debt", 50),
      order("completed", 50, "partially_paid", 10),
    ]);
    expect(a.settled + a.outstanding).toBe(a.billed);
    expect(a.billed).toBe(2500);
  });

  it("keeps an overpayment on its own order instead of netting it off a debt", () => {
    const a = summariseAccount([
      order("approved", 100, "paid", 250),
      order("approved", 900, "unpaid"),
    ]);
    expect(a.settled).toBe(100);
    expect(a.overpaid).toBe(150);
    // The 150 surplus on the first order is NOT change against the second.
    expect(a.outstanding).toBe(900);
  });

  it("counts orders per payment status for the breakdown row", () => {
    const a = summariseAccount([
      order("approved", 1, "unpaid"),
      order("approved", 1, "unpaid"),
      order("completed", 1, "paid", 1),
      order("approved", 1, "debt"),
      order("draft", 1, "unpaid"),
    ]);
    expect(a.counts).toEqual({ unpaid: 2, partially_paid: 0, paid: 1, debt: 1 });
  });
});
