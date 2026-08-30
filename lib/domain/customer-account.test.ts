import { describe, expect, it } from "vitest";

import { summariseAccount, type OrderForAccount } from "./customer-account";

const order = (
  status: string,
  totalPrice: number,
  paymentStatus: OrderForAccount["paymentStatus"],
): OrderForAccount => ({ status, totalPrice, paymentStatus });

describe("summariseAccount", () => {
  it("is all zeroes for a customer with no orders", () => {
    const a = summariseAccount([]);
    expect(a.billed).toBe(0);
    expect(a.outstanding).toBe(0);
  });

  it("counts only binding orders towards the balance", () => {
    const a = summariseAccount([
      order("approved", 1000, "unpaid"),
      order("completed", 500, "paid"),
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

  it("treats a partially paid order as still open — the part paid is unknown", () => {
    // There is no Payment entity until stage 08, so the only honest answer is
    // that the whole order is outstanding rather than a guessed fraction.
    const a = summariseAccount([order("approved", 1000, "partially_paid")]);
    expect(a.settled).toBe(0);
    expect(a.outstanding).toBe(1000);
    expect(a.inDebt).toBe(0);
  });

  it("separates a flagged debt from ordinary unpaid money (FR-7)", () => {
    const a = summariseAccount([order("approved", 300, "unpaid"), order("approved", 700, "debt")]);
    expect(a.outstanding).toBe(1000);
    expect(a.inDebt).toBe(700);
  });

  it("settled plus outstanding always accounts for everything billed", () => {
    const a = summariseAccount([
      order("approved", 1200, "unpaid"),
      order("approved", 800, "paid"),
      order("completed", 450, "debt"),
      order("completed", 50, "partially_paid"),
    ]);
    expect(a.settled + a.outstanding).toBe(a.billed);
    expect(a.billed).toBe(2500);
  });

  it("counts orders per payment status for the breakdown row", () => {
    const a = summariseAccount([
      order("approved", 1, "unpaid"),
      order("approved", 1, "unpaid"),
      order("completed", 1, "paid"),
      order("approved", 1, "debt"),
      order("draft", 1, "unpaid"),
    ]);
    expect(a.counts).toEqual({ unpaid: 2, partially_paid: 0, paid: 1, debt: 1 });
  });
});
