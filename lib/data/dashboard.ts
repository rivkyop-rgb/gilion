/**
 * The six queries behind the dashboard (US-001, FR-20).
 *
 * The dashboard owns no entity — it is a read across five stages — so the only
 * thing this module adds is the guarantee that each number equals the list it
 * links to. Every count here is built from the same `where` its drill-down
 * applies (`attentionWhere`, `billingCustomers`), because a card whose number
 * and whose link disagree teaches the reader that the numbers are decorative.
 *
 * Validation rule 10 is structural rather than remembered: `dashboardCounts`
 * is handed the cards the role actually gets, and a card that is not in that
 * list is a query THAT NEVER RUNS. A designer's dashboard does not hide the
 * debt figure; it never computes it (FR-8).
 */
import { tenantDb } from "./db";
import { attentionWhere } from "./publications";
import { billingCustomers } from "./payments";
import { countOpenReminders } from "./reminders";
import {
  LIVE_PUBLICATION_STATES,
  OPEN_ISSUE_STATES,
  type DashboardCardKey,
} from "@/lib/domain/dashboard";
import { weekRange } from "@/lib/domain/calendar";

export type DashboardCounts = Partial<Record<DashboardCardKey, number>>;

/**
 * Rule 11: under two seconds with a thousand publications.
 *
 * Six counts issued together rather than in sequence — the slowest one sets
 * the wall clock instead of the sum of all six. They are independent reads, so
 * there is nothing to serialise them for.
 */
export async function dashboardCounts(
  businessId: string,
  keys: readonly DashboardCardKey[],
  /**
   * The dashboard's period (27/09/2026): the three PUBLICATION cards count
   * inside it, exactly as the table below them does. No bounds is "all time".
   * Omitted — this week, which is what the bare dashboard shows.
   */
  range?: { from?: Date; to?: Date },
  today = new Date(),
): Promise<DashboardCounts> {
  const db = tenantDb(businessId);
  const week = weekRange(today);
  const period = range ?? { from: week.from, to: week.to };
  const inPeriod =
    period.from || period.to
      ? {
          publication_date: {
            ...(period.from ? { gte: period.from } : {}),
            ...(period.to ? { lte: period.to } : {}),
          },
        }
      : {};
  const wanted = new Set(keys);

  const run = <K extends DashboardCardKey>(
    key: K,
    query: () => Promise<number>,
  ): Promise<[K, number] | null> =>
    wanted.has(key) ? query().then((n) => [key, n]) : Promise.resolve(null);

  const results = await Promise.all([
    run("week", () =>
      db.publication.count({
        where: {
          ...inPeriod,
          // Rule 3: a cancelled publication is counted nowhere.
          status: { in: LIVE_PUBLICATION_STATES },
        },
      }),
    ),
    run("missingAd", () =>
      db.publication.count({ where: { ...attentionWhere("missing_ad"), ...inPeriod } }),
    ),
    run("notPlaced", () =>
      db.publication.count({
        where: {
          ...attentionWhere("not_placed"),
          // Inside the period, like the cards beside it. "כל הזמן" therefore
          // includes dates that already missed their issue — the question
          // there is "everything", and a cleanup list is part of the answer.
          ...inPeriod,
        },
      }),
    ),
    /*
     * Counted through the billing screen's own function rather than a cheaper
     * `groupBy` on `payment_status`.
     *
     * A customer's status there is the WORST among their orders, and it is
     * computed from live publications rather than `AdOrder.total_price`, which
     * does not shrink when a publication is cancelled. A direct count would be
     * cheaper and would disagree with the list it opens, on exactly the
     * customers who matter most.
     */
    run("debt", async () => (await billingCustomers(businessId, { status: "debt" })).length),
    run("reminders", () => countOpenReminders(businessId)),
    run("openIssues", () => db.issue.count({ where: { status: { in: OPEN_ISSUE_STATES } } })),
    run("pendingOrders", () => db.adOrder.count({ where: { status: "pending_approval" } })),
  ]);

  return Object.fromEntries(results.filter((r) => r !== null)) as DashboardCounts;
}

/** The week the dashboard is currently showing — also what its links carry. */
export function dashboardWeek(today = new Date()) {
  return weekRange(today);
}

/**
 * The reminders widget: the few most urgent, plus how many there are.
 *
 * Returns the total alongside the slice for the same reason every other list
 * in this codebase does — a cut list that does not say it was cut reads as the
 * whole answer.
 */
export async function reminderWidget(businessId: string, take = 5) {
  const db = tenantDb(businessId);
  const where = { status: { in: ["needed", "approved_to_send", "failed"] as never } };
  const [rows, total] = await Promise.all([
    db.reminder.findMany({
      where,
      orderBy: { publication: { publication_date: "asc" } },
      take,
      select: {
        id: true,
        status: true,
        customer: { select: { id: true, business_name: true } },
        publication: {
          select: {
            id: true,
            publication_date: true,
            newspaper: { select: { name: true } },
          },
        },
      },
    }),
    db.reminder.count({ where }),
  ]);
  return { rows, total };
}

/**
 * Payment status per order, for the table's ninth column.
 *
 * A SEPARATE query rather than a join on the publication read, so that rule 10
 * is provable rather than promised: for a `designer` this function is never
 * called, and no response on their dashboard carries a payment figure at all
 * (FR-8). Hiding the column while still selecting the field would pass a
 * visual check and fail the one that reads the payload.
 */
export async function paymentStatusByOrder(
  businessId: string,
  orderIds: readonly string[],
): Promise<Map<string, string>> {
  if (orderIds.length === 0) return new Map();
  const rows = await tenantDb(businessId).adOrder.findMany({
    where: { id: { in: [...new Set(orderIds)] } },
    select: { id: true, payment_status: true },
  });
  return new Map(rows.map((r) => [r.id, r.payment_status as string]));
}

/**
 * Sales by week, for the dashboard's first card (redesign, 29/09/2026).
 *
 * "Sales" is the net price of every live publication DATED in the week — the
 * same money the billing screens count (`price` is net of the quantity
 * discount, and a cancelled publication is money nobody will be asked for).
 * Dated by the publication, not by the order, because the question on the card
 * is "what goes out this week", not "what was signed".
 */
export async function weeklySales(
  businessId: string,
  weeks: { from: Date; to: Date }[],
): Promise<{ total: number; count: number }[]> {
  if (weeks.length === 0) return [];
  const rows = await tenantDb(businessId).publication.findMany({
    where: {
      status: { not: "canceled" },
      publication_date: { gte: weeks[0]!.from, lte: weeks[weeks.length - 1]!.to },
    },
    select: { publication_date: true, price: true },
  });
  return weeks.map((w) => {
    const inWeek = rows.filter((r) => r.publication_date >= w.from && r.publication_date <= w.to);
    return {
      total: Math.round(inWeek.reduce((s, r) => s + Number(r.price), 0) * 100) / 100,
      count: inWeek.length,
    };
  });
}
