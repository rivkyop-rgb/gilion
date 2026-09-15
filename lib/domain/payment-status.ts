/**
 * How an order's payment status is DERIVED (US-010, FR-7).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Three levels have to stay consistent, and only the first is ever typed by a
 * person (docs/plan/08-payments-reports.md §מודל הנתונים):
 *
 *   1. `Payment.amount`          what actually arrived, one record at a time.
 *   2. `AdOrder.payment_status`  derived here from the sum of those records.
 *   3. `Publication.payment_status`  inherited from its order, unchanged.
 *
 * `debt` is the reason this is a function and not a dropdown. A debt is not a
 * thing somebody marks — it is "this ran in the paper and has not been paid
 * for", which the system already knows. That is what makes "who owes money" a
 * single query on the dashboard instead of a habit somebody has to keep up.
 */

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "debt";

export const PAYMENT_STATUSES: PaymentStatus[] = ["unpaid", "partially_paid", "paid", "debt"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "לא שולם",
  partially_paid: "שולם חלקית",
  paid: "שולם",
  debt: "חוב",
};

/** A single payment record, as the derivation sees it. */
export type PaymentRecord = {
  amount: number;
  /** A cancelled record is kept and not counted (rule 10). */
  canceled: boolean;
};

/**
 * Publication states that mean "it ran".
 *
 * `billed` is included because it only follows `published` — an invoiced
 * publication has certainly appeared. `canceled` is not a state that ran and
 * not one that blocks: it is excluded from the question entirely by
 * `everythingRan` below.
 */
const RAN_STATES = ["published", "billed"];

export type OrderForStatus = {
  totalPrice: number;
  payments: PaymentRecord[];
  /** Statuses of the publications this order created. */
  publicationStatuses: string[];
};

/** What the customer actually handed over. Cancelled records do not count. */
export function paidTotal(payments: PaymentRecord[]): number {
  return payments.reduce((sum, p) => (p.canceled ? sum : sum + p.amount), 0);
}

/**
 * True when every publication this order created has already run.
 *
 * Cancelled publications are dropped first: an order whose only remaining line
 * ran is owed for, and one cancelled line should not hold the whole order out
 * of `debt` forever.
 *
 * An order with NO publications at all answers false, and that matters more
 * than it looks: "every member of an empty set ran" is vacuously true, and
 * would turn an unpaid draft that has produced nothing into a debt.
 */
export function everythingRan(publicationStatuses: string[]): boolean {
  const live = publicationStatuses.filter((s) => s !== "canceled");
  return live.length > 0 && live.every((s) => RAN_STATES.includes(s));
}

/**
 * The four-row table from the stage file, plus the boundary it does not cover.
 *
 * That boundary is `totalPrice <= 0`. The table's first row says "paid = 0 →
 * unpaid", which would mark an order for nothing as unpaid and then, once its
 * publications ran, as a DEBT — a customer chased for zero shekels. Nothing is
 * owed on a zero total, so it settles as `paid` before the table is consulted.
 */
export function derivePaymentStatus(order: OrderForStatus): PaymentStatus {
  const paid = paidTotal(order.payments);

  // Overpayment is allowed (rule 2) and lands here too — `paid`, with the
  // excess shown on the screen rather than hidden by a clamp.
  if (paid >= order.totalPrice) return "paid";

  const open: PaymentStatus = paid > 0 ? "partially_paid" : "unpaid";
  return everythingRan(order.publicationStatuses) ? "debt" : open;
}

/** What is still open on one order. Never negative — an overpayment is not a credit. */
export function outstandingOf(order: OrderForStatus): number {
  return Math.max(0, order.totalPrice - paidTotal(order.payments));
}

/** The amount received beyond the total, or 0. Rule 2 asks for it to be visible. */
export function overpaymentOf(order: OrderForStatus): number {
  return Math.max(0, paidTotal(order.payments) - order.totalPrice);
}
