import "dotenv/config";
import { Prisma, PrismaClient, type MembershipRole } from "@prisma/client";

import { materializeBaseShapes } from "../lib/domain/base-shapes";
import { deriveGrid } from "../lib/domain/grid";
import { PrismaPg } from "@prisma/adapter-pg";

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

  await deleteTestAdvertisements(prisma);
  await deleteTestOrders(prisma);
  await deleteTestCustomers(prisma);
  await deleteTestNewspapers(prisma);
  await deleteTestBusinesses(prisma);
  await deleteTestUsers(prisma);
  await clearPermissionOverrides(prisma);
  await restoreSeededMemberships(prisma);
  await resetShapeCatalogue(prisma);
  await resetPriceRules(prisma);
  await resetReminderWindow(prisma);

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
  await clearAdObjects([...new Set(ads.map((a) => a.business_id))]);
}

async function clearAdObjects(businessIds: string[]) {
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
    const stream = client.listObjectsV2(bucket, `${businessId}/ads/`, true);
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (o) => o.name && keys.push(o.name));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    if (keys.length > 0) await client.removeObjects(bucket, keys);
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
async function deleteTestOrders(prisma: PrismaClient) {
  await prisma.reminder.deleteMany({});
  await prisma.publication.deleteMany({});
  await prisma.adOrder.deleteMany({});
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
const SEEDED_MEMBERSHIPS: Array<{ user: string; business: string; role: MembershipRole }> = [
  { user: "usr_admin", business: "biz_alpha", role: "admin" },
  { user: "usr_multi", business: "biz_alpha", role: "admin" },
  { user: "usr_multi", business: "biz_beta", role: "admin" },
  { user: "usr_sales", business: "biz_alpha", role: "sales" },
  { user: "usr_designer", business: "biz_alpha", role: "designer" },
  { user: "usr_accounting", business: "biz_alpha", role: "accounting" },
  { user: "usr_beta_admin", business: "biz_beta", role: "admin" },
];

async function restoreSeededMemberships(prisma: PrismaClient) {
  for (const m of SEEDED_MEMBERSHIPS) {
    await prisma.userMembership.updateMany({
      where: { user_id: m.user, business_id: m.business },
      data: { role: m.role, status: "active" },
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
