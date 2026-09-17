import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { basePrisma } from "./db";
import { dashboardCounts } from "./dashboard";
import { listPublicationsPage } from "./publications";
import { DASHBOARD_CARD_KEYS } from "@/lib/domain/dashboard";

/**
 * Validation rule 11: the dashboard loads in under two seconds with a thousand
 * publications.
 *
 * Measured rather than asserted about, because the fixture database holds
 * twenty-five and every query in this module is fast on twenty-five. The
 * failure this guards against is the one that arrives by growth: a publisher's
 * second year, on a screen whose whole promise is "ten seconds to know where
 * you stand".
 *
 * Everything created here is torn down in `afterAll` INCLUDING on failure.
 * A spec that leaves rows behind does not fail in its own file — it fails in
 * somebody else's, as "expected 6, got 1006".
 */

const BUSINESS = "biz_alpha";
const CUSTOMER = "cust_alpha_1";
const NEWSPAPER = "paper_alpha";
const SHAPE = "shape_quarter";

/** Far enough out that no other fixture shares the dates (CLAUDE.md §seed). */
const BASE_DATE = Date.UTC(2031, 0, 5);
const COUNT = 1000;

/** The budget from rule 11, in milliseconds. */
const BUDGET_MS = 2_000;

let orderId = "";

beforeAll(async () => {
  const number = await basePrisma.adOrder
    .aggregate({ where: { business_id: BUSINESS }, _max: { number: true } })
    .then((r) => (r._max.number ?? 0) + 10_000);

  const order = await basePrisma.adOrder.create({
    data: {
      business_id: BUSINESS,
      // Deliberately outside the live sequence so this never collides with a
      // number the product hands out (`Business.last_order_number`).
      number,
      customer_id: CUSTOMER,
      source: "internal",
      status: "approved",
      // The database enforces the pairing (`AdOrder_approved_at_present_when_
      // approved`), which is the schema refusing to hold a state it cannot
      // explain. Worth meeting rather than working around.
      approved_at: new Date(),
      total_price: 0,
    },
  });
  orderId = order.id;

  await basePrisma.publication.createMany({
    data: Array.from({ length: COUNT }, (_, i) => ({
      business_id: BUSINESS,
      order_id: orderId,
      customer_id: CUSTOMER,
      newspaper_id: NEWSPAPER,
      ad_shape_id: SHAPE,
      // Spread over roughly three years so the week filter has to do real work
      // rather than matching everything or nothing.
      publication_date: new Date(BASE_DATE + i * 86_400_000),
      price: 100,
      source: "internal" as const,
      // A third of them waiting for artwork, so the "missing" count is not
      // trivially zero or trivially everything.
      status: i % 3 === 0 ? ("missing_ad" as const) : ("ready_for_layout" as const),
    })),
  });
}, 120_000);

afterAll(async () => {
  if (!orderId) return;
  await basePrisma.publication.deleteMany({ where: { order_id: orderId } });
  await basePrisma.adOrder.deleteMany({ where: { id: orderId } });
});

describe("ביצועי הדשבורד", () => {
  it("יש אלף פרסומים למדוד עליהם", async () => {
    const n = await basePrisma.publication.count({ where: { order_id: orderId } });
    expect(n).toBe(COUNT);
  });

  it("ששת המונים חוזרים בתוך התקציב", async () => {
    const started = Date.now();
    const counts = await dashboardCounts(BUSINESS, DASHBOARD_CARD_KEYS, new Date("2031-06-15"));
    const elapsed = Date.now() - started;

    // Every card answered, not merely a fast empty object.
    for (const key of DASHBOARD_CARD_KEYS) expect(counts[key]).toBeTypeOf("number");
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("המונים והטבלה יחד חוזרים בתוך התקציב", async () => {
    // What the page actually does: the counts and the week's rows in parallel,
    // which is the shape the wall clock is set by.
    const started = Date.now();
    const [counts, table] = await Promise.all([
      dashboardCounts(BUSINESS, DASHBOARD_CARD_KEYS, new Date("2031-06-15")),
      listPublicationsPage(BUSINESS, { from: "2031-06-08", to: "2031-06-14" }),
    ]);
    const elapsed = Date.now() - started;

    expect(counts.week).toBeTypeOf("number");
    expect(table.total).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("כרטיס שהתפקיד אינו רואה אינו שאילתה שרצה", async () => {
    // Rule 10 from the other side: asking for two cards must not compute six.
    const counts = await dashboardCounts(BUSINESS, ["week", "openIssues"], new Date("2031-06-15"));
    expect(Object.keys(counts).sort()).toEqual(["openIssues", "week"]);
    expect(counts.debt).toBeUndefined();
  });

  it("הספירה והרשימה מסכימות על אותו טווח", async () => {
    /*
     * The pairing FR-20 stands on. Both sides are built from one `where`, and
     * this is the assertion that notices if somebody later gives the card its
     * own cheaper query.
     */
    const today = new Date("2031-06-15");
    const counts = await dashboardCounts(BUSINESS, ["week"], today);
    // 2031-06-15 is a Sunday; its week runs to the 21st.
    const table = await listPublicationsPage(BUSINESS, { from: "2031-06-15", to: "2031-06-21" });
    expect(counts.week).toBe(table.total);
  });
});
