import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Seeds one audit row per business so tenant-isolation.spec.ts has a real
 * cross-tenant id to attempt. Ids are fixed so the spec can address them.
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

  await prisma.$disconnect();
}
