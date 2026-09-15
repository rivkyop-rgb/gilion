/**
 * The money summary on a customer card (US-010, FR-7).
 *
 * Pure. Until stage 08 this module had no source for "how much did they
 * actually pay" — there was no `Payment` entity — so it summed what was
 * ordered and how each order was MARKED, counted a partially paid order as
 * fully open, and said so on screen rather than inventing a fraction.
 *
 * `Payment` exists now, so `paidAmount` is a real number per order and the
 * caveat is gone. What did not change is which orders count: a draft or a
 * rejected order is not money anyone owes.
 */

import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "./payment-status";

// Re-exported so the customer card keeps importing its money vocabulary from
// one place. The definitions live with the derivation that produces them.
export { PAYMENT_STATUS_LABELS };
export type { PaymentStatus };

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
  /** Sum of the live (non-cancelled) payment records against this order. */
  paidAmount: number;
};

export type CustomerAccount = {
  /** Sum of every binding order. */
  billed: number;
  /** What actually arrived against those orders — recorded payments, not marks. */
  settled: number;
  /** What is still open: billed minus settled, never below zero. */
  outstanding: number;
  /** The part of `outstanding` sitting on orders that already ran (FR-7). */
  inDebt: number;
  /** Received beyond what was billed. Shown, never netted off a debt. */
  overpaid: number;
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
    overpaid: 0,
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

    // Per order rather than on the totals: an overpayment on one order is not
    // change the customer can spend on another, and netting the two would hide
    // both the surplus and the debt.
    const open = Math.max(0, order.totalPrice - order.paidAmount);
    account.settled += Math.min(order.paidAmount, order.totalPrice);
    account.overpaid += Math.max(0, order.paidAmount - order.totalPrice);
    account.outstanding += open;
    if (order.paymentStatus === "debt") account.inDebt += open;
  }

  return account;
}
