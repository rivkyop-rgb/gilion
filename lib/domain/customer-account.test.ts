import { describe, expect, it } from "vitest";

import { summariseAccount, type PublicationForAccount } from "./customer-account";

const pub = (
  price: number,
  status: string,
  orderId = "o1",
  orderStatus = "approved",
): PublicationForAccount => ({ orderId, orderStatus, status, price });

const paid = (entries: Record<string, number> = {}) => new Map(Object.entries(entries));

describe("summariseAccount", () => {
  it("is all zeroes for a customer with nothing", () => {
    const a = summariseAccount([], paid());
    expect(a.billed).toBe(0);
    expect(a.outstanding).toBe(0);
  });

  it("counts only publications on binding orders", () => {
    const a = summariseAccount(
      [
        pub(1000, "planned"),
        pub(500, "published", "o2", "completed"),
        // Neither of these is money anyone owes.
        pub(9999, "planned", "draft", "draft"),
        pub(8888, "planned", "rejected", "rejected"),
      ],
      paid({ o2: 500 }),
    );
    expect(a.billed).toBe(1500);
    expect(a.settled).toBe(500);
    expect(a.outstanding).toBe(1000);
    expect(a.notBinding).toBe(9999 + 8888);
  });

  /**
   * The case the user described, and the one the old order-level split got
   * wrong: ONE order, one insertion printed and one not.
   */
  it("splits a single order between what ran and what has not", () => {
    const a = summariseAccount([pub(500, "published"), pub(500, "planned")], paid());

    expect(a.outstanding).toBe(1000);
    expect(a.ranOpen).toBe(500);
    expect(a.upcomingOpen).toBe(500);
    // The invariant the whole shape exists for.
    expect(a.ranOpen + a.upcomingOpen).toBe(a.outstanding);
  });

  it("takes a payment off both halves in proportion", () => {
    // 1,000 over two insertions, 600 in: each line carries 300 of it.
    const a = summariseAccount([pub(500, "published"), pub(500, "planned")], paid({ o1: 600 }));
    expect(a.settled).toBe(600);
    expect(a.outstanding).toBe(400);
    expect(a.ranOpen).toBe(200);
    expect(a.upcomingOpen).toBe(200);
  });

  it("counts a published publication as having run", () => {
    // `billed` only ever follows `published`, so it has certainly appeared.
    const a = summariseAccount([pub(300, "published")], paid());
    expect(a.ranOpen).toBe(300);
    expect(a.upcomingOpen).toBe(0);
  });

  it("stops charging for a cancelled publication", () => {
    // AdOrder.total_price is NOT reduced when a line is cancelled — it is the
    // price at approval and stays as a record. Summing live publications is
    // what keeps the customer from being billed for it anyway.
    const a = summariseAccount([pub(500, "published"), pub(400, "canceled")], paid());
    expect(a.billed).toBe(500);
    expect(a.outstanding).toBe(500);
  });

  it("settled plus outstanding always accounts for everything billed", () => {
    const a = summariseAccount(
      [pub(1200, "planned"), pub(800, "published", "o2"), pub(450, "published", "o3")],
      paid({ o2: 800, o3: 50 }),
    );
    expect(a.settled + a.outstanding).toBe(a.billed);
    expect(a.billed).toBe(2450);
  });

  it("keeps an overpayment on its own order instead of netting it off a debt", () => {
    const a = summariseAccount(
      [pub(100, "published"), pub(900, "planned", "o2")],
      paid({ o1: 250 }),
    );
    expect(a.settled).toBe(100);
    expect(a.overpaid).toBe(150);
    // The 150 surplus on the first order is NOT change against the second.
    expect(a.outstanding).toBe(900);
    expect(a.ranOpen).toBe(0);
    expect(a.upcomingOpen).toBe(900);
  });

  it("never lets one line absorb more than it charged", () => {
    const a = summariseAccount([pub(200, "published"), pub(200, "planned")], paid({ o1: 1000 }));
    expect(a.settled).toBe(400);
    expect(a.outstanding).toBe(0);
    expect(a.ranOpen).toBe(0);
    expect(a.upcomingOpen).toBe(0);
  });

  it("holds the invariant under uneven prices and a part payment", () => {
    const a = summariseAccount(
      [pub(333.33, "published"), pub(333.33, "published"), pub(333.34, "planned")],
      paid({ o1: 500 }),
    );
    expect(round(a.ranOpen + a.upcomingOpen)).toBe(a.outstanding);
    expect(round(a.settled + a.outstanding)).toBe(a.billed);
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
