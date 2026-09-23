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
  today = new Date(),
): Promise<DashboardCounts> {
  const db = tenantDb(businessId);
  const week = weekRange(today);
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
          publication_date: { gte: week.from, lte: week.to },
          // Rule 3: a cancelled publication is counted nowhere.
          status: { in: LIVE_PUBLICATION_STATES },
        },
      }),
    ),
    run("missingAd", () => db.publication.count({ where: attentionWhere("missing_ad") })),
    run("notPlaced", () =>
      db.publication.count({
        where: {
          ...attentionWhere("not_placed"),
          // From the start of this week forward. A date that has already gone
          // by missed its issue — that is a cleanup item in the publications
          // list, not a thing anybody can still do today, and letting those
          // accumulate turns the card into a number nobody acts on.
          publication_date: { gte: week.from },
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
