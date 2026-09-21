import { describe, expect, it } from "vitest";

import {
  derivePaymentStatus,
  everythingRan,
  outstandingOf,
  overpaymentOf,
  paidTotal,
  type OrderForStatus,
} from "./payment-status";

const order = (
  totalPrice: number,
  amounts: number[],
  publicationStatuses: string[] = ["placed"],
): OrderForStatus => ({
  totalPrice,
  payments: amounts.map((amount) => ({ amount, canceled: false })),
  publicationStatuses,
});

describe("paidTotal", () => {
  it("sums the live records and ignores the cancelled ones (rule 10)", () => {
    expect(
      paidTotal([
        { amount: 400, canceled: false },
        { amount: 1000, canceled: true },
        { amount: 100, canceled: false },
      ]),
    ).toBe(500);
  });
});

describe("derivePaymentStatus", () => {
  it("is unpaid when nothing arrived", () => {
    expect(derivePaymentStatus(order(1000, []))).toBe("unpaid");
  });

  it("is partially_paid strictly between zero and the total", () => {
    expect(derivePaymentStatus(order(1000, [1]))).toBe("partially_paid");
    expect(derivePaymentStatus(order(1000, [999.99]))).toBe("partially_paid");
  });

  it("is paid exactly at the total", () => {
    expect(derivePaymentStatus(order(1000, [600, 400]))).toBe("paid");
  });

  it("is paid above the total — overpayment is allowed (rule 2)", () => {
    expect(derivePaymentStatus(order(1000, [1500]))).toBe("paid");
  });

  it("a cancelled record stops counting and the status walks back", () => {
    const withCancel: OrderForStatus = {
      totalPrice: 1000,
      payments: [{ amount: 1000, canceled: true }],
      publicationStatuses: ["placed"],
    };
    expect(derivePaymentStatus(withCancel)).toBe("unpaid");
  });

  it("becomes debt once every publication has run and money is still open", () => {
    expect(derivePaymentStatus(order(1000, [], ["published"]))).toBe("debt");
    expect(derivePaymentStatus(order(1000, [300], ["published", "published"]))).toBe("debt");
  });

  it("is not a debt while even one publication has yet to run", () => {
    expect(derivePaymentStatus(order(1000, [], ["published", "placed"]))).toBe("unpaid");
  });

  it("is never a debt once it is fully paid", () => {
    expect(derivePaymentStatus(order(1000, [1000], ["published"]))).toBe("paid");
  });

  it("settles a zero-total order as paid rather than chasing nobody for nothing", () => {
    // The table's first row says "paid = 0 → unpaid", which on a zero total
    // would become a DEBT the moment the publications ran.
    expect(derivePaymentStatus(order(0, [], ["published"]))).toBe("paid");
  });
});

describe("everythingRan", () => {
  it("is false for an order that produced nothing", () => {
    // Vacuous truth would turn an empty draft into a debt.
    expect(everythingRan([])).toBe(false);
  });

  it("ignores cancelled publications", () => {
    expect(everythingRan(["published", "canceled"])).toBe(true);
    expect(everythingRan(["canceled"])).toBe(false);
  });

  it("counts billed as having run — it only follows published", () => {
    expect(everythingRan(["billed", "published"])).toBe(true);
  });

  it("is false while anything is still in layout", () => {
    expect(everythingRan(["published", "ready_for_layout"])).toBe(false);
  });
});

describe("outstandingOf / overpaymentOf", () => {
  it("never reports a negative balance", () => {
    expect(outstandingOf(order(1000, [1500]))).toBe(0);
    expect(overpaymentOf(order(1000, [1500]))).toBe(500);
  });

  it("reports no overpayment on an open order", () => {
    expect(outstandingOf(order(1000, [250]))).toBe(750);
    expect(overpaymentOf(order(1000, [250]))).toBe(0);
  });
});
