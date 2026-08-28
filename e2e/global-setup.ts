import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

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

  await deleteTestNewspapers(prisma);
  await deleteTestBusinesses(prisma);
  await resetShapeCatalogue(prisma);

  await prisma.$disconnect();
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
