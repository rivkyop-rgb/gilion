/**
 * The money summary on a customer card (US-010, FR-7).
 *
 * Pure. Built from PUBLICATIONS and not from orders, and that is the whole
 * shape of this module.
 *
 * The user put it plainly (16/09/2026): what is owed splits into the
 * publications that have already run and the ones that were only ordered, and
 * the total is the two together. An order is not that unit — one order can hold
 * a March insertion that has printed and an April one that has not — so an
 * order-level split answers the question wrongly for exactly the customer who
 * buys the most: a weekly advertiser, two weeks in.
 *
 * Deriving from publications fixes a second thing at the same time. Cancelling
 * a publication does NOT reduce `AdOrder.total_price` — that field is the price
 * at approval and stays as a record — so an order total keeps charging for a
 * line nobody will print. Summing live publications charges for what is
 * actually being sold.
 */

import { apportionedPaid } from "./payment-report";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "./payment-status";

export { PAYMENT_STATUS_LABELS };
export type { PaymentStatus };

/**
 * Only these order states represent money the customer owes.
 *
 * A draft is a proposal and a rejected or cancelled order is nothing at all —
 * counting either into a balance would show a debt for work never agreed.
 */
const BINDING_ORDER_STATUSES = ["approved", "completed"];

/** Publication states that mean the ad has already appeared in print. */
const RAN_STATES = ["published"];

/** A cancelled publication is not a charge. */
const NOT_BILLABLE = ["canceled"];

export type PublicationForAccount = {
  orderId: string;
  /** The order's own status — only a binding order charges anything. */
  orderStatus: string;
  /** The publication's status: what decides printed vs merely ordered. */
  status: string;
  /** The net price frozen on the publication (conventions.md §7). */
  price: number;
  /** With `shares` (allocateOrderPayments), which slice of the payment is this one's. */
  id?: string;
};

export type CustomerAccount = {
  /** Sum of every live publication on a binding order. */
  billed: number;
  /** What actually arrived against them — recorded payments, not marks. */
  settled: number;
  /** billed − settled. ALWAYS equals ranOpen + upcomingOpen. */
  outstanding: number;
  /** Of that: printed and not paid for. A debt in the ordinary sense. */
  ranOpen: number;
  /** Of that: ordered, not printed yet. Owed, but not yet due. */
  upcomingOpen: number;
  /** Received beyond what is billed. Shown, never netted off a debt. */
  overpaid: number;
  /** Ordered on something not binding — shown nowhere, counted nowhere. */
  notBinding: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function summariseAccount(
  publications: PublicationForAccount[],
  /** Live (non-cancelled) payments per order. */
  paidByOrder: Map<string, number>,
  /** Per publication id, from allocateOrderPayments. Wins over the proportion. */
  shares?: ReadonlyMap<string, number>,
): CustomerAccount {
  // Each order's own billable total — the denominator every share divides by.
  const billableByOrder = new Map<string, number>();
  for (const p of publications) {
    if (!BINDING_ORDER_STATUSES.includes(p.orderStatus)) continue;
    if (NOT_BILLABLE.includes(p.status)) continue;
    billableByOrder.set(p.orderId, (billableByOrder.get(p.orderId) ?? 0) + p.price);
  }

  const account: CustomerAccount = {
    billed: 0,
    settled: 0,
    outstanding: 0,
    ranOpen: 0,
    upcomingOpen: 0,
    overpaid: 0,
    notBinding: 0,
  };

  for (const p of publications) {
    if (!BINDING_ORDER_STATUSES.includes(p.orderStatus)) {
      account.notBinding += p.price;
      continue;
    }
    if (NOT_BILLABLE.includes(p.status)) continue;

    const billable = billableByOrder.get(p.orderId) ?? 0;
    const paid = paidByOrder.get(p.orderId) ?? 0;

    // Clamped to the publication's own price: a payment bigger than the order
    // is an overpayment on the ORDER, and must not make one line look like it
    // absorbed more than it ever charged.
    const share = Math.min(
      shares && p.id !== undefined
        ? (shares.get(p.id) ?? 0)
        : apportionedPaid(p.price, billable, paid),
      p.price,
    );
    const open = Math.max(0, p.price - share);

    account.billed += p.price;
    account.settled += share;
    account.outstanding += open;
    // The split the user asked for, made at the level printing happens at.
    if (RAN_STATES.includes(p.status)) account.ranOpen += open;
    else account.upcomingOpen += open;
  }

  // Overpayment is a property of the ORDER, so it is counted once per order and
  // not once per line.
  for (const [orderId, billable] of billableByOrder) {
    const paid = paidByOrder.get(orderId) ?? 0;
    account.overpaid += Math.max(0, paid - billable);
  }

  return {
    billed: round2(account.billed),
    settled: round2(account.settled),
    // Rounded once, at the end, and the two parts are rounded from the same
    // pass — so `outstanding === ranOpen + upcomingOpen` survives on screen and
    // not only in the arithmetic.
    outstanding: round2(account.ranOpen + account.upcomingOpen),
    ranOpen: round2(account.ranOpen),
    upcomingOpen: round2(account.upcomingOpen),
    overpaid: round2(account.overpaid),
    notBinding: round2(account.notBinding),
  };
}
