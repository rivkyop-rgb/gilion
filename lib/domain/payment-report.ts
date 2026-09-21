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
      row.paid += apportionedPaid(pub.price, orderTotals.get(pub.orderId) ?? 0, order.paidAmount);

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
