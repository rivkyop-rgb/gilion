/**
 * Splitting one payment across the orders it settles (US-010, FR-7).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * A customer hands over one sum against four invoices. Making somebody open
 * four forms and divide it by hand is both tedious and a way to get the
 * arithmetic wrong, so the sum is typed once and split here.
 *
 * The rule is the ordinary accounting one: OLDEST OPEN FIRST. It is not a
 * preference — it is the only order in which the answer does not depend on who
 * is doing the typing, and it is what a customer means when they say "I'm
 * paying off what I owe you". Anything cleverer (largest first, the one with
 * the invoice number they quoted) is a decision about a specific conversation,
 * and those are made by naming the order instead.
 */

export type OpenOrder = {
  orderId: string;
  /** What the sentence calls it: ORD-0042. */
  number: number;
  /** What is still owed on it. Orders with nothing open are not passed in. */
  open: number;
  /** Used only to sort. Oldest first. */
  createdAt: Date;
};

export type Allocation = { orderId: string; number: number; amount: number };

export type AllocationResult = {
  allocations: Allocation[];
  /**
   * What is left after every open order is settled — the customer's credit.
   *
   * Deliberately NOT pushed onto the last order as an overpayment: money that
   * is not against anything is not against the last thing that happened to be
   * on the list. It stays the customer's, visible, until somebody says where
   * it goes.
   */
  leftover: number;
};

/** Money is two decimal places. Splitting must not invent a third. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Splits `amount` across the open orders, oldest first.
 *
 * Each order takes at most what is open on it, so no order is ever overpaid by
 * a split — an overpayment is something a person does deliberately by naming
 * one order, and it should not happen as a side effect of arithmetic.
 */
export function allocatePayment(amount: number, openOrders: OpenOrder[]): AllocationResult {
  if (!(amount > 0)) return { allocations: [], leftover: 0 };

  const queue = [...openOrders]
    .filter((o) => o.open > 0)
    .sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.orderId.localeCompare(b.orderId),
    );

  const allocations: Allocation[] = [];
  let remaining = round2(amount);

  for (const order of queue) {
    if (remaining <= 0) break;
    const take = round2(Math.min(remaining, order.open));
    if (take <= 0) continue;
    allocations.push({ orderId: order.orderId, number: order.number, amount: take });
    remaining = round2(remaining - take);
  }

  return { allocations, leftover: round2(Math.max(0, remaining)) };
}

/**
 * The sentence the screen says before the payment is saved.
 *
 * A split that is about to happen has to be readable BEFORE the button is
 * pressed — the alternative is a person discovering after the fact that their
 * ₪5,000 went somewhere they did not intend, and the only undo is cancelling
 * several records.
 */
export function describeAllocation(
  result: AllocationResult,
  orderLabel: (n: number) => string,
): string {
  const { allocations, leftover } = result;
  if (allocations.length === 0) {
    return leftover > 0 ? "אין כרגע חוב פתוח — הסכום כולו ייזקף ליתרת הלקוח" : "אין מה לשייך";
  }

  const parts = allocations.map((a) => `${orderLabel(a.number)} — ${money(a.amount)}`);
  const head =
    allocations.length === 1
      ? `ייסגר מול ${parts[0]}`
      : `יתחלק בין ${allocations.length} הזמנות: ${parts.join(" · ")}`;

  return leftover > 0 ? `${head}. נותרו ${money(leftover)} ליתרת הלקוח` : head;
}

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });
function money(n: number): string {
  return MONEY.format(n);
}

/**
 * What a customer's position actually is, once a credit is in the picture.
 *
 * `outstanding` and `credit` are kept apart rather than netted, because they
 * are different facts: one is money owed on named invoices and the other is
 * money held with nothing named. Netting them to a single number hides both —
 * a customer who owes ₪500 on a published ad and holds ₪500 credit is not the
 * same as a customer with a clean sheet, and only one of them needs a phone
 * call.
 */
export type CustomerPosition = {
  outstanding: number;
  credit: number;
  /** outstanding − credit. Negative means the customer is ahead. */
  net: number;
};

export function positionOf(outstanding: number, credit: number): CustomerPosition {
  return {
    outstanding: round2(outstanding),
    credit: round2(credit),
    net: round2(outstanding - credit),
  };
}

/** `יתרה לזכות` / `יתרה לחובה` — the label the net number carries. */
export function positionLabel(net: number): string {
  if (net > 0) return "יתרה לחובה";
  if (net < 0) return "יתרה לזכות";
  return "מאוזן";
}
