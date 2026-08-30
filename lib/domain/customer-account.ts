/**
 * The money summary on a customer card (US-010, FR-7).
 *
 * Pure. It sums what the system can actually answer TODAY, and is explicit
 * about the one thing it cannot: there is no `Payment` entity until stage 08,
 * so "how much did they actually pay" has no source. Inventing it from
 * `payment_status` would produce a number that looks precise and is not — a
 * `paid` order would silently claim its full total was received, and a
 * `partially_paid` one would have to guess.
 *
 * What IS knowable is what was committed to and how each order is marked, so
 * that is what this returns.
 */

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "debt";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "לא שולם",
  partially_paid: "שולם חלקית",
  paid: "שולם",
  debt: "חוב",
};

/**
 * Only these order states represent money the customer owes.
 *
 * A draft is a proposal and a rejected or cancelled order is nothing at all —
 * counting either into a balance would show a debt for work never agreed.
 */
const BINDING_ORDER_STATUSES = ["approved", "completed"] as const;

export type OrderForAccount = {
  status: string;
  totalPrice: number;
  paymentStatus: PaymentStatus;
};

export type CustomerAccount = {
  /** Sum of every binding order. */
  billed: number;
  /** Binding orders marked `paid` — settled in full. */
  settled: number;
  /** Binding orders not yet marked `paid`: what is still open. */
  outstanding: number;
  /** The subset of `outstanding` that someone has flagged as a debt (FR-7). */
  inDebt: number;
  /** Orders that are still drafts or proposals — shown, never counted. */
  notBinding: number;
  counts: Record<PaymentStatus, number>;
};

export function summariseAccount(orders: OrderForAccount[]): CustomerAccount {
  const account: CustomerAccount = {
    billed: 0,
    settled: 0,
    outstanding: 0,
    inDebt: 0,
    notBinding: 0,
    counts: { unpaid: 0, partially_paid: 0, paid: 0, debt: 0 },
  };

  for (const order of orders) {
    if (!(BINDING_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      account.notBinding += order.totalPrice;
      continue;
    }
    account.billed += order.totalPrice;
    account.counts[order.paymentStatus] += 1;

    if (order.paymentStatus === "paid") {
      account.settled += order.totalPrice;
    } else {
      account.outstanding += order.totalPrice;
      if (order.paymentStatus === "debt") account.inDebt += order.totalPrice;
    }
  }

  return account;
}
