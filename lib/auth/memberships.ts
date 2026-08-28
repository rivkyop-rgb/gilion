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

/**
 * Every business, shaped like a membership, for a super admin.
 *
 * They hold no membership rows — the flag replaces them — so the picker needs
 * a list built from the businesses themselves. The role is reported as `admin`
 * because that is how they act once inside one.
 */
export async function allBusinessesForSuperAdmin(): Promise<ActiveMembership[]> {
  const rows = await basePrisma.business.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return rows.map((b) => ({
    businessId: b.id,
    businessName: b.name,
    role: "admin" as Role,
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
