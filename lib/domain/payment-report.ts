/**
 * The billing report's periods and its per-customer arithmetic (US-010).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Two jobs, and they are separate on purpose. Resolving "this week" to a pair
 * of dates is a calendar question with one right answer and no database in it,
 * and summing a period into one row per customer is arithmetic. Both are the
 * kind of thing that is wrong in the interesting cases — the week that crosses
 * a month, the customer with two orders and one invoice — so both are tested
 * without a browser.
 */

export type PeriodKind = "week" | "month" | "custom";

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: "שבועי",
  month: "חודשי",
  custom: "מותאם",
};

export type DateRange = { from: string; to: string };

/** `yyyy-mm-dd` for a UTC instant — the shape every stored Date comparison uses. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The week containing `anchor`, Sunday through Saturday.
 *
 * Sunday and not Monday because this is an Israeli newspaper: the working week
 * starts on Sunday, an issue that comes out on Tuesday belongs to the week that
 * began two days earlier, and a Monday-based week would split it from the sales
 * that produced it. Inclusive at both ends — `to` is the Saturday itself, so a
 * publication dated Saturday is in the week a person would say it is in.
 */
export function weekOf(anchor: Date): DateRange {
  const start = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: isoDay(start), to: isoDay(end) };
}

/** The calendar month containing `anchor`, first through last day. */
export function monthOf(anchor: Date): DateRange {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  // Day 0 of the NEXT month is the last day of this one — which is what makes
  // February and leap years a non-question.
  return {
    from: isoDay(new Date(Date.UTC(year, month, 1))),
    to: isoDay(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/**
 * The range a filter bar resolves to.
 *
 * `custom` hands back exactly what was typed, including a half-open pair: a
 * report with only a start date is a legitimate question ("everything since")
 * and refusing it would be the form arguing with the user.
 */
export function resolvePeriod(
  kind: PeriodKind,
  anchorIso: string,
  custom?: Partial<DateRange>,
  today = new Date(),
): DateRange {
  if (kind === "custom") return { from: custom?.from ?? "", to: custom?.to ?? "" };
  const anchor = anchorIso ? new Date(`${anchorIso}T00:00:00Z`) : today;
  const valid = Number.isNaN(anchor.getTime()) ? today : anchor;
  return kind === "week" ? weekOf(valid) : monthOf(valid);
}

/** Moves a week or a month one step. `custom` has no neighbours and stays put. */
export function shiftPeriod(kind: PeriodKind, anchorIso: string, steps: number): string {
  if (kind === "custom" || !anchorIso) return anchorIso;
  const d = new Date(`${anchorIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return anchorIso;
  if (kind === "week") d.setUTCDate(d.getUTCDate() + 7 * steps);
  else d.setUTCMonth(d.getUTCMonth() + steps);
  return isoDay(d);
}

// ---------------------------------------------------------------------------
// Per-customer aggregation
// ---------------------------------------------------------------------------

/**
 * One publication in the period, with the order it was sold on.
 *
 * The report is built from PUBLICATIONS and not from orders, because that is
 * the thing that has a date: an order placed in March for four weeks of April
 * belongs to April's report four times over, not to March's once.
 */
export type ReportPublication = {
  customerId: string;
  customerLabel: string;
  newspaperId: string;
  orderId: string;
  /** The net price frozen on the publication (conventions.md §7). */
  price: number;
  status: string;
  /** With `shares` (allocateOrderPayments), which slice of the payment is this one's. */
  id?: string;
};

/** One order's money, as the report sees it. Payments are order-level. */
export type ReportOrder = {
  orderId: string;
  paidAmount: number;
  invoiceNumbers: string[];
};

export type ReportRow = {
  customerId: string;
  customerLabel: string;
  /** Sum of the publications in the period. What the customer is charged for. */
  billed: number;
  /** Received against the orders those publications sit on, capped at billed. */
  paid: number;
  /** billed − paid, never below zero. */
  outstanding: number;
  publicationCount: number;
  invoiceNumbers: string[];
};

export type ReportTotals = {
  billed: number;
  paid: number;
  outstanding: number;
  customersInDebt: number;
  publicationCount: number;
};

/** Publications that are not a charge: a cancelled line is not billed for. */
const NOT_BILLABLE = ["canceled"];

/**
 * How much of an order's payment belongs to ONE publication on it.
 *
 * A payment sits on an order and an order can cross periods, so any view
 * narrower than the whole order has to divide it. The rule is proportional —
 * a publication that is a quarter of what the order billed carries a quarter of
 * what was paid.
 *
 * Exported because two screens ask it (the period report and the per-month
 * panel on a customer), and two copies of this rule would eventually quote
 * different numbers for the same month.
 *
 * A zero-total order cannot be divided; nothing was billed on it, so none of
 * its payment belongs to any slice of it — and the guard is also what keeps a
 * NaN from spreading into every total on the page.
 */
export function apportionedPaid(price: number, orderTotal: number, orderPaid: number): number {
  if (!(orderTotal > 0)) return 0;
  return orderPaid * (price / orderTotal);
}

/** One billable publication, as the allocation below needs to see it. */
export type OrderSlice = {
  id: string;
  orderId: string;
  price: number;
  date: Date | string;
  /** Already printed — what is owed first. */
  ran: boolean;
};

/**
 * How an order's payments cover its publications (08/11/2026): what already
 * ran first, oldest first, and only then what is still to come.
 *
 * It used to be proportional (`apportionedPaid`), so ₪1,000 on a ten-week
 * order closed ₪100 of the week that had already printed and spread the rest
 * over weeks nobody had printed yet — the printed week stayed "debt" after the
 * customer paid more than half of it. Collection works the other way: money
 * goes against the oldest printed invoice first, and every screen reading this
 * map says the same thing about the same week.
 *
 * Called with EVERY billable publication of the orders involved, never a
 * period's slice of them: the order of coverage is a property of the whole
 * order.
 */
export function allocateOrderPayments(
  slices: readonly OrderSlice[],
  paidByOrder: ReadonlyMap<string, number>,
): Map<string, number> {
  const byOrder = new Map<string, OrderSlice[]>();
  for (const s of slices) {
    const list = byOrder.get(s.orderId) ?? [];
    list.push(s);
    byOrder.set(s.orderId, list);
  }
  const time = (d: Date | string) => (typeof d === "string" ? Date.parse(d) : d.getTime());
  const shares = new Map<string, number>();
  for (const [orderId, list] of byOrder) {
    let left = Math.max(0, paidByOrder.get(orderId) ?? 0);
    const queue = [...list].sort(
      (a, b) =>
        Number(b.ran) - Number(a.ran) || time(a.date) - time(b.date) || a.id.localeCompare(b.id),
    );
    for (const s of queue) {
      const share = Math.min(left, s.price);
      shares.set(s.id, share);
      left -= share;
    }
  }
  return shares;
}

/**
 * One row per customer, sorted by what they owe.
 *
 * Money received is attributed PROPORTIONALLY to the part of its order that
 * falls inside the period. An order of four weekly insertions paid in full in
 * April, viewed a week at a time, has to show a quarter of the payment against
 * each week — otherwise the first week of the month reads as paid in full and
 * the other three as pure debt, and the weekly report becomes unusable for
 * exactly the customers who buy the most.
 */
export function buildReport(
  publications: ReportPublication[],
  orders: ReportOrder[],
  /** The whole order's billable total, for the proportion above. */
  orderTotals: Map<string, number>,
  /** Per publication id, from allocateOrderPayments. Wins over the proportion. */
  shares?: ReadonlyMap<string, number>,
): { rows: ReportRow[]; totals: ReportTotals } {
  const byOrder = new Map(orders.map((o) => [o.orderId, o]));
  const rows = new Map<string, ReportRow>();
  /** Per customer: which orders contributed, so an invoice is listed once. */
  const seenOrders = new Map<string, Set<string>>();

  for (const pub of publications) {
    if (NOT_BILLABLE.includes(pub.status)) continue;

    const row = rows.get(pub.customerId) ?? {
      customerId: pub.customerId,
      customerLabel: pub.customerLabel,
      billed: 0,
      paid: 0,
      outstanding: 0,
      publicationCount: 0,
      invoiceNumbers: [],
    };

    row.billed += pub.price;
    row.publicationCount += 1;

    const order = byOrder.get(pub.orderId);
    if (order) {
      row.paid +=
        shares && pub.id !== undefined
          ? (shares.get(pub.id) ?? 0)
          : apportionedPaid(pub.price, orderTotals.get(pub.orderId) ?? 0, order.paidAmount);

      const seen = seenOrders.get(pub.customerId) ?? new Set<string>();
      if (!seen.has(pub.orderId)) {
        seen.add(pub.orderId);
        seenOrders.set(pub.customerId, seen);
        for (const inv of order.invoiceNumbers) {
          if (inv && !row.invoiceNumbers.includes(inv)) row.invoiceNumbers.push(inv);
        }
      }
    }

    rows.set(pub.customerId, row);
  }

  const list = [...rows.values()].map((row) => ({
    ...row,
    // Rounded once, at the end: apportioning by fractions and rounding each
    // slice makes the column stop summing to the total shown above it.
    billed: round2(row.billed),
    paid: round2(Math.min(row.paid, row.billed)),
    outstanding: round2(Math.max(0, row.billed - row.paid)),
  }));

  list.sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed);

  return {
    rows: list,
    totals: {
      billed: round2(list.reduce((s, r) => s + r.billed, 0)),
      paid: round2(list.reduce((s, r) => s + r.paid, 0)),
      outstanding: round2(list.reduce((s, r) => s + r.outstanding, 0)),
      customersInDebt: list.filter((r) => r.outstanding > 0).length,
      publicationCount: list.reduce((s, r) => s + r.publicationCount, 0),
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CoveragePayment = {
  id: string;
  orderId: string;
  amount: number;
  /** Payments on one order are spent in the order they arrived. */
  date: Date | string;
};

export type CoverageLine = { sliceId: string; date: Date | string; amount: number; price: number };

/**
 * Which publications each payment paid for (08/11/2026: "₪400 כיסו את 29.10
 * ו־5.11 במלואם ו־₪80 מ־12.11").
 *
 * The same queue as `allocateOrderPayments` — printed first, then by date — fed
 * by the order's payments one at a time, oldest first. So the lines of every
 * payment on an order add up to exactly the shares that function gives, and
 * the sentence under a payment never disagrees with the months above it.
 */
export function coverageByPayment(
  slices: readonly OrderSlice[],
  payments: readonly CoveragePayment[],
): Map<string, CoverageLine[]> {
  const time = (d: Date | string) => (typeof d === "string" ? Date.parse(d) : d.getTime());
  const result = new Map<string, CoverageLine[]>();
  const orders = new Set(payments.map((p) => p.orderId));
  for (const orderId of orders) {
    const queue = slices
      .filter((s) => s.orderId === orderId)
      .sort(
        (a, b) =>
          Number(b.ran) - Number(a.ran) || time(a.date) - time(b.date) || a.id.localeCompare(b.id),
      )
      .map((s) => ({ slice: s, left: s.price }));
    const paying = payments
      .filter((p) => p.orderId === orderId)
      .sort((a, b) => time(a.date) - time(b.date) || a.id.localeCompare(b.id));
    let at = 0;
    for (const payment of paying) {
      const lines: CoverageLine[] = [];
      let money = Math.max(0, payment.amount);
      while (money > 0.005 && at < queue.length) {
        const item = queue[at]!;
        const take = Math.min(money, item.left);
        if (take > 0.005) {
          lines.push({
            sliceId: item.slice.id,
            date: item.slice.date,
            amount: Math.round(take * 100) / 100,
            price: item.slice.price,
          });
        }
        item.left -= take;
        money -= take;
        if (item.left <= 0.005) at += 1;
      }
      result.set(payment.id, lines);
    }
  }
  return result;
}

/**
 * The lines as one sentence: "כיסה את 29.10 ו־5.11 במלואם, ו־₪80 מתוך 12.11".
 * `day` formats a date the way the screen does.
 */
export function coveragePhrase(
  lines: readonly CoverageLine[],
  day: (d: Date | string) => string,
  money: (n: number) => string,
): string | null {
  if (lines.length === 0) return null;
  const full = lines.filter((l) => l.amount >= l.price - 0.005).map((l) => day(l.date));
  const part = lines.filter((l) => l.amount < l.price - 0.005);
  const join = (xs: string[]) =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ו־${xs[xs.length - 1]}`;
  const pieces: string[] = [];
  if (full.length > 0) {
    pieces.push(`${join(full)} ${full.length === 1 ? "במלואו" : "במלואם"}`);
  }
  for (const l of part) pieces.push(`${money(l.amount)} מתוך ${day(l.date)}`);
  return `כיסה את ${pieces.length > 1 ? `${pieces.slice(0, -1).join(", ")}, ו־${pieces[pieces.length - 1]}` : pieces[0]}`;
}
