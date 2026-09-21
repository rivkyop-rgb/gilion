/**
 * What a customer owes, month by month (US-010).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The billing panel used to break a balance down by ORDER, which is the shape
 * the data happens to have and not the shape the question has. `ORD-3K1VBH` is
 * an internal id; nobody rings a customer about it. What a person says is "you
 * still owe for March and April", so that is what the screen has to show.
 *
 * A month is not a column on any row — it is the publication DATE, which is why
 * this groups publications and not orders. An order sold in March for four
 * weeks of April belongs to April, four times over.
 */

import { apportionedPaid } from "./payment-report";

export type MonthlyPublication = {
  /** The publication date. The only thing that decides which month this is. */
  date: Date;
  /** The net price frozen on the publication (conventions.md §7). */
  price: number;
  orderId: string;
  status: string;
};

export type MonthRow = {
  /** `yyyy-mm`, for sorting and for keys. */
  key: string;
  /** `מרץ 2028` — what the row actually says. */
  label: string;
  billed: number;
  paid: number;
  /** billed − paid, never below zero. */
  open: number;
  publicationCount: number;
};

/** A cancelled publication is not a charge, so it is not part of any month. */
const NOT_BILLABLE = ["canceled"];

const MONTH_LABEL = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** `2028-03` for a stored date. UTC, because that is how dates are stored. */
export function monthKeyOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** `מרץ 2028`. Derived from the key so a row and its label cannot disagree. */
export function monthLabelOf(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * One row per month the customer has publications in, oldest first.
 *
 * Oldest first because that is both chronological order and collection order —
 * the month somebody chases is the one that has been open longest, and a list that
 * put the newest on top would bury it.
 *
 * Money received is apportioned by the same rule the period report uses
 * (`apportionedPaid`), and deliberately through the same function: a payment
 * sits on an ORDER, an order can cross months, and if the two screens split it
 * differently then the monthly panel and the monthly report would quote
 * different numbers for the same month.
 */
export function monthlyBreakdown(
  publications: MonthlyPublication[],
  /** Each order's own billable total — the denominator for the share. */
  orderTotals: Map<string, number>,
  /** Live (non-cancelled) payments per order. */
  orderPaid: Map<string, number>,
): { months: MonthRow[]; totals: { billed: number; paid: number; open: number } } {
  const byMonth = new Map<string, MonthRow>();

  for (const publication of publications) {
    if (NOT_BILLABLE.includes(publication.status)) continue;

    const key = monthKeyOf(publication.date);
    const row = byMonth.get(key) ?? {
      key,
      label: monthLabelOf(key),
      billed: 0,
      paid: 0,
      open: 0,
      publicationCount: 0,
    };

    row.billed += publication.price;
    row.paid += apportionedPaid(
      publication.price,
      orderTotals.get(publication.orderId) ?? 0,
      orderPaid.get(publication.orderId) ?? 0,
    );
    row.publicationCount += 1;
    byMonth.set(key, row);
  }

  const months = [...byMonth.values()]
    .map((row) => {
      // Rounded once, at the end: rounding each apportioned slice makes the
      // column stop summing to the total printed under it.
      const billed = round2(row.billed);
      const paid = round2(Math.min(row.paid, row.billed));
      return { ...row, billed, paid, open: round2(Math.max(0, billed - paid)) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    months,
    totals: {
      billed: round2(months.reduce((s, m) => s + m.billed, 0)),
      paid: round2(months.reduce((s, m) => s + m.paid, 0)),
      open: round2(months.reduce((s, m) => s + m.open, 0)),
    },
  };
}

/**
 * The months still owed for, as one sentence.
 *
 * What somebody reads out on the phone: "עוד פתוח על מרץ ואפריל". Capped at
 * three names plus a count, because past that it is a list and not a sentence —
 * and the table underneath is the list.
 */
export function openMonthsPhrase(months: MonthRow[]): string {
  const open = months.filter((m) => m.open > 0);
  if (open.length === 0) return "אין חודש פתוח";
  const names = open.map((m) => m.label);
  if (names.length <= 3) {
    return names.length === 1
      ? `פתוח על ${names[0]}`
      : `פתוח על ${names.slice(0, -1).join(", ")} ו${names[names.length - 1]}`;
  }
  return `פתוח על ${names.length} חודשים, מ${names[0]}`;
}
