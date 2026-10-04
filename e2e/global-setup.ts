import "dotenv/config";
import { Prisma, PrismaClient, type MembershipRole } from "@prisma/client";

import { materializeBaseShapes } from "../lib/domain/base-shapes";
import { deriveGrid } from "../lib/domain/grid";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

/** Must match prisma/seed.ts and e2e/helpers.ts. */
const SEED_PASSWORD = "gilion1234";

/**
 * Puts the database into the state every spec assumes, before the run starts.
 *
 * Two jobs:
 *  1. One audit row per business, so tenant-isolation.spec.ts has a real
 *     cross-tenant id to attempt. Ids are fixed so the spec can address them.
 *  2. Reset the shape catalogue. The catalogue specs create shapes and never
 *     remove them, so without this every run leaves more rows behind than the
 *     last — the settings screens get slower each time and the suite starts
 *     failing on timeouts that have nothing to do with the code. Cleaning up
 *     here rather than in each spec keeps the specs readable and makes the
 *     starting state identical whether you run one file or all of them.
 */
export const ALPHA_AUDIT_ID = "audit_alpha_fixture";
export const BETA_AUDIT_ID = "audit_beta_fixture";

export default async function globalSetup() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const rows = [
    { id: ALPHA_AUDIT_ID, business_id: "biz_alpha", user_id: "usr_admin", target_id: "alpha" },
    { id: BETA_AUDIT_ID, business_id: "biz_beta", user_id: "usr_beta_admin", target_id: "beta" },
  ];

  for (const r of rows) {
    await prisma.auditLog.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        business_id: r.business_id,
        user_id: r.user_id,
        action: "approve_order",
        target_type: "E2EFixture",
        target_id: r.target_id,
      },
    });
  }

  // Issues come first: Placement is Restrict from both Publication and
  // Advertisement, so nothing below can be removed while one still points at
  // it.
  await deleteTestIssues(prisma);
  await deleteTestAdvertisements(prisma);
  await deleteTestPayments(prisma);
  await deleteTestOrders(prisma);
  await deleteTestCustomers(prisma);
  await deleteTestNewspapers(prisma);
  await deleteTestBusinesses(prisma);
  await deleteTestUsers(prisma);
  await restoreSeededPasswords(prisma);
  await clearAuditTrail(prisma);
  await clearPermissionOverrides(prisma);
  await restoreSeededMemberships(prisma);
  await resetShapeCatalogue(prisma);
  await resetPageTypes(prisma);
  await resetPackages(prisma);
  await resetPriceRules(prisma);
  await resetReminderWindow(prisma);
  await clearBusinessSettings(prisma);
  await seedIssueFixtures(prisma);

  await prisma.$disconnect();
}

/**
 * Removes every advertisement, and the objects behind them.
 *
 * prisma/seed.ts creates NO advertisements, so anything here was uploaded by a
 * spec — and the upload specs deliberately re-upload the same file names every
 * run. Left behind, those turn `getByText("ad.pdf")` into a strict-mode
 * violation on the second run and the library into a few hundred cards on the
 * fiftieth. The publications go first: advertisement_id is SET NULL on delete,
 * but a publication left pointing at a deleted file would still be sitting in
 * a status that claims it has one.
 */
async function deleteTestAdvertisements(prisma: PrismaClient) {
  const ads = await prisma.advertisement.findMany({ select: { id: true, business_id: true } });
  if (ads.length === 0) return;

  // The order-level artwork points at the same rows.
  await prisma.adOrder.updateMany({
    where: { advertisement_id: { not: null } },
    data: { advertisement_id: null },
  });
  await prisma.publication.updateMany({
    where: { advertisement_id: { not: null } },
    data: { advertisement_id: null, status: "missing_ad" },
  });
  await prisma.advertisement.deleteMany({});

  // The bucket has to be emptied too, or every run leaves a few megabytes
  // behind for a row that no longer exists.
  await clearObjects([...new Set(ads.map((a) => a.business_id))], "ads");
}

/**
 * Back to the shipped brand, the shipped palette and the shipped wording.
 *
 * prisma/seed.ts creates NO BusinessSettings row: a business that never opened
 * the admin panel has none, and that is the state every run has to start from.
 * A row left behind by admin-panel-theme.spec.ts repaints the whole product for
 * every OTHER spec — and the failure would appear as a screenshot diff or a
 * colour assertion in a file that never touched settings.
 *
 * The uploaded logos go too. They are not deleted by any cascade — the row
 * points at an object store, not at a foreign key — so without this the bucket
 * accumulates one mark per run, and `admin-panel-branding.spec.ts` cannot tell
 * "the logo I just uploaded" from "the logo the last run uploaded".
 */
async function clearBusinessSettings(prisma: PrismaClient) {
  const rows = await prisma.businessSettings.findMany({ select: { business_id: true } });
  if (rows.length === 0) return;

  await prisma.businessSettings.deleteMany({});
  await clearObjects([...new Set(rows.map((r) => r.business_id))], "brand");
}

async function clearObjects(
  businessIds: string[],
  folder: "ads" | "reserved" | "issues" | "brand",
) {
  const { Client } = await import("minio");
  const client = new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
  const bucket = process.env.MINIO_BUCKET!;
  if (!(await client.bucketExists(bucket))) return;

  for (const businessId of businessIds) {
    const keys: string[] = [];
    const stream = client.listObjectsV2(bucket, `${businessId}/${folder}/`, true);
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (o) => o.name && keys.push(o.name));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    if (keys.length > 0) await client.removeObjects(bucket, keys);
  }
}

/**
 * The seeded page types, and exactly which shapes each of them allows.
 *
 * Mirrors prisma/seed.ts. Kept as data here rather than imported, because the
 * seed is a script that connects to the database — this file needs the FACTS,
 * not the act of writing them.
 */
const SEEDED_PAGE_TYPES: Record<string, { newspaperId: string; name: string; shapes: string[] }> = {
  pt_cat_front: {
    newspaperId: "paper_catalog",
    name: "שער קטלוג",
    shapes: ["shape_catalog_quarter", "shape_catalog_eighth"],
  },
  pt_cat_inner: {
    newspaperId: "paper_catalog",
    name: "פנימי קטלוג",
    shapes: [
      "shape_catalog_full",
      "shape_catalog_half_h",
      "shape_catalog_quarter",
      "shape_catalog_eighth",
    ],
  },
  pt_cover: { newspaperId: "paper_alpha", name: "שער", shapes: ["shape_strip", "shape_quarter"] },
  pt_inner: {
    newspaperId: "paper_alpha",
    name: "פנימי",
    shapes: ["shape_full", "shape_half_h", "shape_half_v", "shape_quarter", "shape_eighth"],
  },
  pt_back: {
    newspaperId: "paper_alpha",
    name: "גב",
    shapes: ["shape_full", "shape_half_h"],
  },
  pt_cat_back: {
    newspaperId: "paper_catalog",
    name: "גב קטלוג",
    shapes: ["shape_catalog_full", "shape_catalog_half_h"],
  },
  pt_beta_cover: {
    newspaperId: "paper_beta",
    name: "שער",
    shapes: ["shape_beta_strip", "shape_beta_quarter"],
  },
  pt_beta_inner: {
    newspaperId: "paper_beta",
    name: "פנימי",
    shapes: [
      "shape_beta_full",
      "shape_beta_half_h",
      "shape_beta_half_v",
      "shape_beta_quarter",
      "shape_beta_eighth",
    ],
  },
  pt_beta_back: {
    newspaperId: "paper_beta",
    name: "גב",
    shapes: ["shape_beta_full", "shape_beta_half_h"],
  },
};

/**
 * Puts the page types and their permitted shapes back the way the seed leaves
 * them.
 *
 * `resetShapeCatalogue` above restores the SHAPES, and stopped there — so every
 * spec that ticked a box in the allowed-shapes matrix left the tick behind for
 * good. The seeded cover accepts two shapes; after enough runs it accepted all
 * six, and the failure landed nowhere near the spec that caused it: a full-page
 * ad stopped being refused on the cover, and the pricing matrix stopped marking
 * that combination impossible. Both read as product regressions and were
 * neither.
 *
 * Page types the specs CREATED on a seeded newspaper go too. A stray one is not
 * merely clutter — it appears in the order builder's pickers and in the issue
 * composer, and shifts what "the first option" means.
 */
/**
 * Removes every ad package (backlog item 12).
 *
 * prisma/seed.ts creates none. One left behind quietly discounts every order
 * spec that adds enough lines to earn it — and those specs assert exact totals,
 * so the failure lands as "expected 2,000, received 1,800" in a file that never
 * heard of packages.
 */
async function resetPackages(prisma: PrismaClient) {
  await prisma.adPackage.deleteMany({});
}

async function resetPageTypes(prisma: PrismaClient) {
  const seededIds = Object.keys(SEEDED_PAGE_TYPES);

  // Reserved areas are page-type state too (backlog item 14). prisma/seed.ts
  // creates none, so every row here was drawn by a spec — and one left behind
  // takes a slice of the cover out of the market for every placement spec in
  // the next run, which surfaces as "the ad will not go where it always goes".
  const reserved = await prisma.pageReservation.findMany({ select: { newspaper_id: true } });
  await prisma.pageReservation.deleteMany({});
  if (reserved.length > 0) {
    // The logo objects go with the rows, for the same reason the ad objects do.
    const papers = await prisma.newspaper.findMany({
      where: { id: { in: [...new Set(reserved.map((r) => r.newspaper_id))] } },
      select: { business_id: true },
    });
    await clearObjects([...new Set(papers.map((p) => p.business_id))], "reserved");
  }

  // Only on the seeded newspapers: a newspaper a spec created is removed whole
  // at the start of the next run, and its page types go with it.
  await prisma.pageType.deleteMany({
    where: {
      newspaper_id: { in: ["paper_alpha", "paper_beta", "paper_catalog"] },
      id: { notIn: seededIds },
    },
  });

  for (const [id, spec] of Object.entries(SEEDED_PAGE_TYPES)) {
    await prisma.pageType.upsert({
      where: { id },
      update: { name: spec.name },
      create: { id, newspaper_id: spec.newspaperId, name: spec.name },
    });

    await prisma.allowedAdShape.deleteMany({
      where: { page_type_id: id, ad_shape_id: { notIn: spec.shapes } },
    });
    for (const shapeId of spec.shapes) {
      await prisma.allowedAdShape.upsert({
        where: { page_type_id_ad_shape_id: { page_type_id: id, ad_shape_id: shapeId } },
        update: {},
        create: { newspaper_id: spec.newspaperId, page_type_id: id, ad_shape_id: shapeId },
      });
    }
  }
}

/**
 * Restores the price list to exactly what prisma/seed.ts leaves behind.
 *
 * The seed creates ONE rule — inner page, quarter page, 1200 — and the specs
 * write over it and over neighbouring cells freely. Left alone, a price typed
 * by the pricing spec becomes the "base price" the order specs then measure
 * against, and the failure surfaces two files away as a total that is off by
 * an amount nobody can explain.
 *
 * Same act as resetShapeCatalogue above: put the tenant back the way the seed
 * leaves it.
 */
async function resetPriceRules(prisma: PrismaClient) {
  await prisma.priceRule.deleteMany({});

  const quarter = await prisma.adShape.findFirst({
    where: { newspaper_id: "paper_alpha", name: { contains: "רבע" } },
  });
  if (!quarter) return;

  await prisma.priceRule.create({
    data: {
      newspaper_id: "paper_alpha",
      page_type_id: "pt_inner",
      ad_shape_id: quarter.id,
      price: 1200,
    },
  });
}

/**
 * Puts the reminder window back to the seeded default.
 *
 * reminders-flow.spec.ts widens it to 30 days to prove the setting works and
 * sets it back — but a run that fails in between leaves every business
 * chasing customers a month out, and the next run then measures a window
 * nobody chose. Same reasoning as the permission overrides below.
 */
async function resetReminderWindow(prisma: PrismaClient) {
  await prisma.business.updateMany({ data: { reminder_days_before: 7 } });
  await prisma.reminder.deleteMany({});
}

/**
 * Removes every order and publication.
 *
 * prisma/seed.ts creates NONE of either — every one of them was made by a
 * spec — so the honest starting state is empty. Left behind they accumulate
 * without bound, and the symptom is subtle rather than slow: the reminder list
 * is sorted by publication date, so a leftover row from an earlier run sits
 * ABOVE the one the current spec just created, and "the first row" stops
 * meaning what the spec thinks it means.
 *
 * Reminders and payments cascade or are cleared alongside; AdOrderItem
 * cascades from AdOrder.
 */
/**
 * Every payment record (stage 08).
 *
 * prisma/seed.ts creates none, so anything here was typed by a spec. Three
 * reasons this cannot be skipped, and only the first is obvious:
 *
 *  1. Payment → Customer is Restrict. A stray record makes the customer it
 *     names undeletable, and `deleteTestCustomers` below fails with a foreign
 *     key error in a file that never touched money.
 *  2. The billing KPIs are SUMS over the whole business. A payment from last
 *     run is silently added to every total a later run asserts on, and the
 *     failure reads as arithmetic that is wrong by an amount nobody typed.
 *  3. `AdOrder.payment_status` is DERIVED from these rows. A leftover payment
 *     against the seeded fixture order leaves that order marked `paid` — so a
 *     spec about debt starts from a state no spec chose.
 */
async function deleteTestPayments(prisma: PrismaClient) {
  await prisma.payment.deleteMany({});
  // And the derived answer goes back to what no-payments means. Done as a bulk
  // write rather than through the domain function on purpose: this is a reset
  // to a known start state, not a business event.
  await prisma.adOrder.updateMany({ data: { payment_status: "unpaid" } });
  await prisma.publication.updateMany({ data: { payment_status: "unpaid" } });
}

async function deleteTestOrders(prisma: PrismaClient) {
  await prisma.reminder.deleteMany({});
  await prisma.publication.deleteMany({});
  await prisma.adOrder.deleteMany({});

  // The order counter too, or it is state a run changes and never gives back:
  // every suite creates a few dozen orders, so the numbers climb for ever and
  // the demo opens on ORD-0236 rather than ORD-0001. Safe here and only here —
  // every order was just deleted, so nothing can collide with a fresh 1.
  await prisma.business.updateMany({ data: { last_order_number: 0 } });
  // The suites were written against draft → pending_approval → approved, and
  // that is what they keep exercising. The business setting defaults to
  // direct approval (25/09/2026); order-direct-approval.spec.ts turns it off
  // for itself and puts it back.
  await prisma.business.updateMany({
    data: { internal_orders_need_approval: true, mail_client: "gmail" },
  });
  // Auto-placement's per-page-type setting (27/09/2026): every type open, none
  // chosen to grow with — what a spec that changed it would otherwise leak.
  await prisma.pageType.updateMany({ data: { auto_place: true, auto_grow: false } });
  // Stage 09 (backlog 21): a spec that edits the portal address must not
  // leave the next run's /p/merkaz pointing nowhere.
  await prisma.business.update({ where: { id: "biz_alpha" }, data: { slug: "merkaz" } });
  await prisma.business.update({ where: { id: "biz_beta" }, data: { slug: "tzafon" } });
}

/**
 * Every audit row a spec wrote, leaving only the two fixtures.
 *
 * AuditLog is append-only by design (conventions.md §6): nothing cascades it
 * away when the order or issue it describes is deleted, and there is no
 * endpoint that could. So a spec that approves an order leaves a row behind
 * FOREVER — and tenant-isolation.spec.ts counts the audit listing of the other
 * business expecting exactly its one fixture row. One approved order over there
 * turns 1 into 2, in a spec that never approved anything and is about tenant
 * boundaries.
 *
 * Deleting by "anything that is not a fixture id" rather than by chasing the
 * rows down from their targets, because by the time this runs the targets are
 * usually already gone and the rows are orphans nothing can find.
 *
 * prisma/seed.ts writes no audit rows at all; the two fixtures are upserted at
 * the top of this file.
 */
async function clearAuditTrail(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany({
    where: { id: { notIn: [ALPHA_AUDIT_ID, BETA_AUDIT_ID] } },
  });
}

/**
 * Removes customers the specs created, and the orders and publications behind
 * them.
 *
 * Same id rule as the users below: prisma/seed.ts gives every customer an
 * explicit `cust_` id, so a cuid was made through the UI. Left behind they do
 * not merely clutter — the customers list is paginated at 25, so after a few
 * dozen strays the SEEDED customer that half the specs assert on falls off
 * page one and those specs fail with "element not found". That reads exactly
 * like a broken screen and is not one.
 *
 * Customer is Restrict from both AdOrder and Publication, which is why
 * deleteTestOrders runs before this one.
 */
async function deleteTestCustomers(prisma: PrismaClient) {
  const strays = await prisma.customer.findMany({
    where: { id: { not: { startsWith: "cust_" } } },
    select: { id: true },
  });
  if (strays.length === 0) return;

  // Orders and publications are already gone — deleteTestOrders clears every
  // one of them, for every customer, just above.
  await prisma.customer.deleteMany({ where: { id: { in: strays.map((c) => c.id) } } });
}

/**
 * Removes newspapers the specs created.
 *
 * `newspaper-setup.spec.ts` creates a newspaper per run and never deletes it,
 * so the settings list and the cross-newspaper shape overview grow without
 * bound — every extra newspaper is another six shapes and another six previews
 * to render. Only the two seeded ids are keepers.
 */
/** Every id prisma/seed.ts creates. Anything else was made by a spec. */
const SEEDED_NEWSPAPER_IDS = ["paper_alpha", "paper_catalog", "paper_beta"];
const SEEDED_BUSINESS_IDS = ["biz_alpha", "biz_beta"];

async function deleteTestNewspapers(prisma: PrismaClient) {
  await prisma.newspaper.deleteMany({
    where: { id: { notIn: SEEDED_NEWSPAPER_IDS } },
  });
}

/**
 * Clears every permission override.
 *
 * The permissions specs change a cell, assert, and change it back — but a run
 * that fails between those two steps leaves the override behind, and the NEXT
 * run then starts from a matrix nobody chose. The first symptom is a test
 * asserting a default refusal that no longer refuses, which reads like a
 * product regression and is not one.
 *
 * Overrides are a business SETTING, so resetting them is the same act as
 * restoring the seeded shapes: put the tenant back the way prisma/seed.ts
 * leaves it, which is with no overrides at all.
 */
async function clearPermissionOverrides(prisma: PrismaClient) {
  await prisma.rolePermission.deleteMany({});
}

/**
 * Puts every seeded person's password back to the one prisma/seed.ts set.
 *
 * Stage 12 gave people a way to change their own password and admins a way to
 * reset somebody else's — which makes the password a thing a spec can now
 * change, and a thing that nothing else here would put back. A run that
 * changed `usr_admin`'s password and stopped before changing it back would
 * leave EVERY later run unable to sign in at all, in every file, with a
 * failure that says nothing about where it came from.
 *
 * Deliberately unconditional rather than "only if it differs": reading the
 * hash to compare it costs the same as writing it, and a condition is one more
 * thing that can be wrong.
 */
async function restoreSeededPasswords(prisma: PrismaClient) {
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  await prisma.user.updateMany({
    where: { id: { startsWith: "usr_" } },
    data: { password_hash: hash },
  });
}

/**
 * Removes users the specs created.
 *
 * `team.spec.ts` adds a designer and a deputy admin per run and never removes
 * them, so the seeded business grows a person every time — four active admins
 * after four runs. Any future test that counts them, or any screen that
 * behaves differently with one admin versus several, then depends on how many
 * times the suite happened to have been run.
 *
 * The rule is the id shape: prisma/seed.ts gives every person it creates an
 * explicit `usr_` id, and anything created through the UI gets a cuid. Audit
 * rows go first — AuditLog.user_id is onDelete: Restrict.
 */
async function deleteTestUsers(prisma: PrismaClient) {
  const strays = await prisma.user.findMany({
    where: { id: { not: { startsWith: "usr_" } }, is_super_admin: false },
    select: { id: true },
  });
  if (strays.length === 0) return;

  const ids = strays.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.userMembership.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Removes businesses the super-admin spec created, and the admins that came
 * with them.
 *
 * Same reason as the newspapers above: the spec creates one per run and never
 * cleans up, so /platform grows a row per run forever. The users go first —
 * Business is onDelete: Restrict, so a membership still pointing at it would
 * block the delete.
 */
async function deleteTestBusinesses(prisma: PrismaClient) {
  const strays = await prisma.business.findMany({
    where: { id: { notIn: SEEDED_BUSINESS_IDS } },
    select: { id: true, memberships: { select: { user_id: true } } },
  });
  if (strays.length === 0) return;

  const businessIds = strays.map((b) => b.id);
  const userIds = [...new Set(strays.flatMap((b) => b.memberships.map((m) => m.user_id)))];

  // AuditLog.business_id is onDelete: Restrict, and the deactivation specs
  // leave rows behind, so the trail has to go before the business it points
  // at. Only ever here, in test cleanup: production never deletes a business —
  // that is precisely what deactivation exists for.
  await prisma.auditLog.deleteMany({ where: { business_id: { in: businessIds } } });
  await prisma.userMembership.deleteMany({ where: { business_id: { in: businessIds } } });
  // Only users left with no membership at all — never one of the seeded people.
  for (const id of userIds) {
    const remaining = await prisma.userMembership.count({ where: { user_id: id } });
    if (remaining === 0) await prisma.user.deleteMany({ where: { id, is_super_admin: false } });
  }
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
}

/**
 * Restores the seeded people to the roles prisma/seed.ts gives them.
 *
 * `usr_multi` was found sitting as `designer` in the second business instead
 * of `admin`, which broke tenant-isolation in a way that looked like a
 * permissions regression and was not one. No spec in this suite changes a
 * role, so WHAT moved it is not established — and that is exactly why this
 * exists: the suite should not depend on nobody ever having drifted.
 *
 * Same idea as resetShapeCatalogue below. The list mirrors the `people` array
 * in prisma/seed.ts; if a role changes there, it changes here.
 */
const SEEDED_MEMBERSHIPS: Array<{
  user: string;
  business: string;
  role: MembershipRole;
  /** Portal logins only — the CHECK constraint requires it for role = customer. */
  customer?: string;
}> = [
  { user: "usr_admin", business: "biz_alpha", role: "admin" },
  { user: "usr_multi", business: "biz_alpha", role: "admin" },
  { user: "usr_multi", business: "biz_beta", role: "admin" },
  { user: "usr_sales", business: "biz_alpha", role: "sales" },
  { user: "usr_designer", business: "biz_alpha", role: "designer" },
  { user: "usr_accounting", business: "biz_alpha", role: "accounting" },
  { user: "usr_beta_admin", business: "biz_beta", role: "admin" },
  // Stage 09: two portal logins at two customers of the same business, which
  // portal-isolation.spec.ts depends on being exactly that.
  { user: "usr_customer", business: "biz_alpha", role: "customer", customer: "cust_alpha_1" },
  { user: "usr_customer_2", business: "biz_alpha", role: "customer", customer: "cust_alpha_3" },
];

async function restoreSeededMemberships(prisma: PrismaClient) {
  for (const m of SEEDED_MEMBERSHIPS) {
    await prisma.userMembership.updateMany({
      where: { user_id: m.user, business_id: m.business },
      data: { role: m.role, status: "active", customer_id: m.customer ?? null },
    });
  }
}

/**
 * Deletes shapes the specs created and restores the seeded six to exactly the
 * geometry prisma/seed.ts gives them — the region specs edit `shape_strip` in
 * place, so upserting the ids back is not enough on its own.
 */
async function resetShapeCatalogue(prisma: PrismaClient) {
  const papers = await prisma.newspaper.findMany({
    where: { id: { in: ["paper_alpha", "paper_beta"] } },
  });

  for (const paper of papers) {
    const grid = deriveGrid({
      pageSize: paper.page_size,
      customWidthMm: paper.custom_width_mm ? Number(paper.custom_width_mm) : null,
      customHeightMm: paper.custom_height_mm ? Number(paper.custom_height_mm) : null,
      marginMm: Number(paper.margin),
      columns: paper.columns,
      rowHeightMm: Number(paper.row_height_mm),
      gutterMm: Number(paper.gutter_mm),
    });
    if (!grid) continue;

    const catalogue = materializeBaseShapes(grid);
    const prefix = paper.id === "paper_alpha" ? "shape_" : "shape_beta_";
    const seeded = catalogue.map((s) => `${prefix}${s.key}`);

    // Everything a spec added, including its allowed_shapes and price_rules,
    // which cascade.
    await prisma.adShape.deleteMany({
      where: { newspaper_id: paper.id, id: { notIn: seeded } },
    });

    for (const shape of catalogue) {
      const row = {
        id: `${prefix}${shape.key}`,
        newspaper_id: paper.id,
        name: shape.name,
        cols: shape.cols,
        rows: shape.rows,
        position_mode: shape.positionMode,
        allowed_cells:
          shape.allowedCells === null
            ? Prisma.DbNull
            : { cells: shape.allowedCells.map(([col, r]) => [col, r]) },
      };
      await prisma.adShape.upsert({ where: { id: row.id }, update: row, create: row });
    }
  }
}

/* -------------------------------------------------------------- stage 06 */

/**
 * Two fixed dates, and the reason they are fixed — and the reason they are
 * these two in particular.
 *
 * Fixed, because a relative date ("today plus 30") drifts across a run that
 * starts at 23:59 and can wander into the reminder window, which would make
 * the issue fixtures appear as rows the reminder specs then count.
 *
 * June 2027, because the order specs already publish on 2026-12-01/08/15/22
 * and through Jan-Feb 2027. A publication lands on this board whenever it
 * shares the newspaper AND the date, so an overlap does not fail in the spec
 * that created it — it fails in `placement-happy-path`, as "expected (6),
 * received (9)", three files away. **Any new fixture date must be checked
 * against every date the order specs use.**
 *
 * BOARD_DATE carries a ready-made issue that the placement specs mutate and
 * reset between tests. OPEN_DATE deliberately has publications but NO issue,
 * so the spec that opens one has something real to open onto.
 */
export const BOARD_DATE = "2027-06-15";
export const OPEN_DATE = "2027-06-22";
/**
 * A date of its own for the specs that CLOSE an issue.
 *
 * The board fixture can never be closed and that is deliberate: it exists to
 * make every placement rule reachable, so two of its six publications have
 * artwork that is refused on purpose. An issue with an unplaceable publication
 * on its date always has a blocking finding 1.
 *
 * So the close specs get their own day, with one publication and one usable ad
 * on it. Checked against every other fixture date in this file, because a
 * publication lands on a board by (newspaper, date) alone and a date reused by
 * accident shows up as "expected 6, received 7" in a file that never heard of
 * PDFs (CLAUDE.md).
 */
export const CLOSE_DATE = "2027-07-06";

/** Ids the placement specs address directly. */
export const ISSUE_FIXTURES = {
  order: "ord_issue_fixture",
  adOk: "ad_issue_ok",
  adOrphan: "ad_issue_orphan",
  issue: "iss_fixture",
  pageCover: "ipage_cover",
  pageInnerA: "ipage_inner_a",
  pageInnerB: "ipage_inner_b",
  pageBack: "ipage_back",
  quarterA: "pub_issue_quarter_a",
  quarterB: "pub_issue_quarter_b",
  strip: "pub_issue_strip",
  full: "pub_issue_full",
  noAd: "pub_issue_no_ad",
  orphanAd: "pub_issue_orphan_ad",
  openA: "pub_open_a",
  openB: "pub_open_b",
  /** The closeable issue and its single, correctly-dressed publication. */
  closeIssue: "iss_close_fixture",
  closePageCover: "ipage_close_cover",
  closePageInner: "ipage_close_inner",
  closePageInnerB: "ipage_close_inner_b",
  closePageBack: "ipage_close_back",
  closePublication: "pub_close_a",
  /** Placed on the cover by resetCloseIssue — the ad the final PDF contains. */
  closePlacement: "plc_close_a",
  /** An ad that exists and did not pass validation — finding 3. */
  adBroken: "ad_issue_broken",
} as const;

/**
 * An approved order whose publications are due on the two fixture dates.
 *
 * Built here rather than driven through the order screens: every placement
 * spec would otherwise start with the same sign-in-and-approve preamble, and a
 * failure in the ORDER builder would then fail the whole placement suite for a
 * reason that has nothing to do with placement.
 *
 * The publications are deliberately not interchangeable — each exists to make
 * exactly one rule reachable:
 *   quarterA/quarterB  two identical shapes: occupied space, moving, duplicates
 *   strip              position-constrained to the foot of the page (rule 7)
 *   full               a shape the cover page type does not allow (rule 5)
 *   noAd / orphanAd    the two artwork refusals (rules 3-4)
 */
async function seedIssueFixtures(prisma: PrismaClient) {
  const file = (name: string) => `biz_alpha/ads/${name}/current.pdf`;

  for (const ad of [
    { id: ISSUE_FIXTURES.adOk, customer_id: "cust_alpha_1", name: "מודעת שיבוץ.pdf" },
    { id: ISSUE_FIXTURES.adOrphan, customer_id: null, name: "מודעה ללא לקוח.pdf" },
    // Belongs to the right customer and did NOT pass validation — the only way
    // to reach finding 3, which is about a file that rotted AFTER it was placed.
    {
      id: ISSUE_FIXTURES.adBroken,
      customer_id: "cust_alpha_1",
      name: "מודעה פגומה.pdf",
      validation_status: "failed" as const,
    },
  ]) {
    await prisma.advertisement.upsert({
      where: { id: ad.id },
      update: {},
      create: {
        id: ad.id,
        business_id: "biz_alpha",
        customer_id: ad.customer_id,
        uploaded_by_user_id: "usr_admin",
        name: ad.name,
        file_type: "pdf",
        file_size: 1024,
        file_url: file(ad.id),
        original_file_url: file(ad.id),
        // No object exists behind these rows and none is needed: the board
        // renders a placeholder when preview_url is null and never fetches.
        preview_url: null,
        status: "valid",
        validation_status: ad.validation_status ?? "passed",
      },
    });
  }

  // Order numbers are a real per-business sequence with a CHECK that they are
  // positive, so the fixture draws one like any other order — and only on the
  // first run, or the counter would climb by one every time the suite starts.
  const existingOrder = await prisma.adOrder.findUnique({
    where: { id: ISSUE_FIXTURES.order },
    select: { number: true },
  });
  const fixtureNumber =
    existingOrder?.number ??
    (
      await prisma.business.update({
        where: { id: "biz_alpha" },
        data: { last_order_number: { increment: 1 } },
        select: { last_order_number: true },
      })
    ).last_order_number;

  await prisma.adOrder.upsert({
    where: { id: ISSUE_FIXTURES.order },
    update: {},
    create: {
      id: ISSUE_FIXTURES.order,
      business_id: "biz_alpha",
      customer_id: "cust_alpha_1",
      source: "internal",
      status: "approved",
      total_price: 0,
      approved_at: new Date(),
      number: fixtureNumber,
    },
  });

  const rows = [
    {
      id: ISSUE_FIXTURES.quarterA,
      date: BOARD_DATE,
      shape: "shape_quarter",
      ad: ISSUE_FIXTURES.adOk,
    },
    {
      id: ISSUE_FIXTURES.quarterB,
      date: BOARD_DATE,
      shape: "shape_quarter",
      ad: ISSUE_FIXTURES.adOk,
    },
    { id: ISSUE_FIXTURES.strip, date: BOARD_DATE, shape: "shape_strip", ad: ISSUE_FIXTURES.adOk },
    { id: ISSUE_FIXTURES.full, date: BOARD_DATE, shape: "shape_full", ad: ISSUE_FIXTURES.adOk },
    { id: ISSUE_FIXTURES.noAd, date: BOARD_DATE, shape: "shape_quarter", ad: null },
    {
      id: ISSUE_FIXTURES.orphanAd,
      date: BOARD_DATE,
      shape: "shape_quarter",
      ad: ISSUE_FIXTURES.adOrphan,
    },
    { id: ISSUE_FIXTURES.openA, date: OPEN_DATE, shape: "shape_quarter", ad: ISSUE_FIXTURES.adOk },
    { id: ISSUE_FIXTURES.openB, date: OPEN_DATE, shape: "shape_eighth", ad: ISSUE_FIXTURES.adOk },
    // ONE publication on CLOSE_DATE, and nothing wrong with it: the close specs
    // need an issue that passes all seven checks, which the board fixture never
    // can.
    {
      id: ISSUE_FIXTURES.closePublication,
      date: CLOSE_DATE,
      shape: "shape_quarter",
      ad: ISSUE_FIXTURES.adOk,
    },
  ];

  for (const row of rows) {
    await prisma.publication.upsert({
      where: { id: row.id },
      update: {},
      create: {
        id: row.id,
        business_id: "biz_alpha",
        order_id: ISSUE_FIXTURES.order,
        customer_id: "cust_alpha_1",
        newspaper_id: "paper_alpha",
        ad_shape_id: row.shape,
        advertisement_id: row.ad,
        publication_date: new Date(row.date),
        price: new Prisma.Decimal(1200),
        source: "internal",
        // Only an ad that is valid AND belongs to the publication's customer
        // reaches ready_for_layout — the rule afterAdLinked applies.
        status:
          row.ad === ISSUE_FIXTURES.adOk
            ? "ready_for_layout"
            : row.ad
              ? "ad_received"
              : "missing_ad",
        placement_status: "not_placed",
      },
    });
  }

  await seedFixtureIssue(prisma);
  await seedCloseIssue(prisma);
}

/**
 * The issue the close-and-PDF specs work on (stage 07).
 *
 * FOUR pages, one publication, one usable ad. Four and not two because a
 * saddle-stitched issue folds in sheets of four (lib/domain/imposition.ts) — a
 * two-page fixture cannot be folded at all, raises finding 8 on every close
 * spec, and produces a press sheet with two blank halves. Kept apart from the
 * board fixture on purpose — see CLOSE_DATE. The placement itself is put on by
 * `resetCloseIssue` in issue-helpers.ts rather than here, because closing marks
 * it `published` and every close spec has to start from `placed` again.
 */
async function seedCloseIssue(prisma: PrismaClient) {
  const paper = await prisma.newspaper.findUnique({ where: { id: "paper_alpha" } });
  if (!paper) return;

  await prisma.issue.upsert({
    where: { id: ISSUE_FIXTURES.closeIssue },
    update: { status: "in_layout", closed_at: null, final_pdf_url: null },
    create: {
      id: ISSUE_FIXTURES.closeIssue,
      business_id: "biz_alpha",
      newspaper_id: "paper_alpha",
      issue_date: new Date(CLOSE_DATE),
      status: "in_layout",
      page_size: paper.page_size,
      custom_width_mm: paper.custom_width_mm,
      custom_height_mm: paper.custom_height_mm,
      margin: paper.margin,
      columns: paper.columns,
      row_height_mm: paper.row_height_mm,
      gutter_mm: paper.gutter_mm,
    },
  });

  for (const page of [
    { id: ISSUE_FIXTURES.closePageCover, page_type_id: "pt_cover", page_number: 1 },
    { id: ISSUE_FIXTURES.closePageInner, page_type_id: "pt_inner", page_number: 2 },
    { id: ISSUE_FIXTURES.closePageInnerB, page_type_id: "pt_inner", page_number: 3 },
    { id: ISSUE_FIXTURES.closePageBack, page_type_id: "pt_back", page_number: 4 },
  ]) {
    await prisma.issuePage.upsert({
      where: { id: page.id },
      update: {},
      create: { ...page, issue_id: ISSUE_FIXTURES.closeIssue },
    });
  }
}

/**
 * The issue the placement specs work on, with its grid already snapshotted.
 *
 * Four pages, laid out the way a printed issue actually is: page 1 is the
 * cover, the last page is the back, and the two between them are the inner
 * spread. That is not decoration — the board groups pages by POSITION
 * (lib/domain/issue-layout.ts), so a fixture whose cover sat at page 2 would
 * exercise a layout no printer produces.
 *
 * The page TYPES are chosen so three different rules are reachable: the cover
 * type accepts only two shapes (rule 5), the inner type accepts nearly
 * everything (the happy path), and the strip's allowed region is measured
 * against the same grid on both.
 */
async function seedFixtureIssue(prisma: PrismaClient) {
  const paper = await prisma.newspaper.findUnique({ where: { id: "paper_alpha" } });
  if (!paper) return;

  await prisma.issue.upsert({
    where: { id: ISSUE_FIXTURES.issue },
    update: { status: "in_layout", closed_at: null },
    create: {
      id: ISSUE_FIXTURES.issue,
      business_id: "biz_alpha",
      newspaper_id: "paper_alpha",
      issue_date: new Date(BOARD_DATE),
      status: "in_layout",
      page_size: paper.page_size,
      custom_width_mm: paper.custom_width_mm,
      custom_height_mm: paper.custom_height_mm,
      margin: paper.margin,
      columns: paper.columns,
      row_height_mm: paper.row_height_mm,
      gutter_mm: paper.gutter_mm,
    },
  });

  const pages = [
    { id: ISSUE_FIXTURES.pageCover, page_type_id: "pt_cover", page_number: 1 },
    { id: ISSUE_FIXTURES.pageInnerA, page_type_id: "pt_inner", page_number: 2 },
    { id: ISSUE_FIXTURES.pageInnerB, page_type_id: "pt_inner", page_number: 3 },
    { id: ISSUE_FIXTURES.pageBack, page_type_id: "pt_back", page_number: 4 },
  ];
  for (const page of pages) {
    await prisma.issuePage.upsert({
      where: { id: page.id },
      update: {},
      create: { ...page, issue_id: ISSUE_FIXTURES.issue },
    });
  }
}

/**
 * Removes every issue, page and placement.
 *
 * prisma/seed.ts creates none, so anything here is left over from a spec — and
 * leaving one behind is not merely clutter: an issue is unique per (newspaper,
 * date), so the SECOND run of the open-an-issue spec would be refused by the
 * database for a reason that looks nothing like the thing being tested.
 */
async function deleteTestIssues(prisma: PrismaClient) {
  // The generation log points at the issue and cascades with it, but the FILE
  // does not: an issue closed by a previous run leaves a final.pdf in the
  // bucket whose row is about to disappear. Left there, the bucket grows by a
  // few megabytes a run and — worse — issue-draft-pdf.spec.ts asserts that
  // NOTHING is written under a business's issues/ prefix, which is a claim last
  // week's close would quietly falsify.
  const businessIds = [
    ...new Set(
      (await prisma.issue.findMany({ select: { business_id: true } })).map((i) => i.business_id),
    ),
  ];

  await prisma.placement.deleteMany({});
  await prisma.issuePage.deleteMany({});
  await prisma.issue.deleteMany({});

  if (businessIds.length > 0) await clearObjects(businessIds, "issues");
}
