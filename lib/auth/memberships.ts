/**
 * Membership lookups. These run *before* a business is active, so they use the
 * unscoped client deliberately — the tenant extension cannot help when the
 * whole point is to discover which tenants the user may enter.
 */
import { basePrisma } from "@/lib/data/db";
import type { Role } from "./rbac";

export type ActiveMembership = {
  businessId: string;
  businessName: string;
  role: Role;
  customerId?: string;
};

export async function activeMembershipsFor(userId: string): Promise<ActiveMembership[]> {
  const rows = await basePrisma.userMembership.findMany({
    where: { user_id: userId, status: "active" },
    include: { business: { select: { id: true, name: true } } },
    orderBy: { business: { name: "asc" } },
  });

  return rows.map((r) => ({
    businessId: r.business_id,
    businessName: r.business.name,
    role: r.role as Role,
    ...(r.customer_id ? { customerId: r.customer_id } : {}),
  }));
}

/** Returns the membership only when it is active — the check setActiveBusiness relies on. */
export async function activeMembership(
  userId: string,
  businessId: string,
): Promise<ActiveMembership | null> {
  const row = await basePrisma.userMembership.findFirst({
    where: { user_id: userId, business_id: businessId, status: "active" },
    include: { business: { select: { id: true, name: true } } },
  });
  if (!row) return null;

  return {
    businessId: row.business_id,
    businessName: row.business.name,
    role: row.role as Role,
    ...(row.customer_id ? { customerId: row.customer_id } : {}),
  };
}
