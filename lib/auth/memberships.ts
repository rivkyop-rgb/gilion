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
    // An inactive business is not offered at all: a membership in a closed
    // business is not a way in, and listing it would only produce a row that
    // fails when clicked.
    where: { user_id: userId, status: "active", business: { status: "active" } },
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
    where: { status: "active" },
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
    // Both have to be active: a live membership in a closed business is not a
    // way in. This is the check setActiveBusiness relies on, so it is where a
    // deactivation actually takes effect.
    where: {
      user_id: userId,
      business_id: businessId,
      status: "active",
      business: { status: "active" },
    },
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

/**
 * The signed-in user, with the memberships that decide where they land.
 *
 * Lives here rather than in the login action because it runs BEFORE a business
 * is active: the unscoped client is correct, and it is confined to this layer
 * on purpose (conventions.md §2, enforced in eslint.config.mjs).
 */
export async function userForSignInRouting(email: string) {
  return basePrisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      user_type: true,
      memberships: {
        where: { status: "active" },
        select: {
          id: true,
          business_id: true,
          role: true,
          customer_id: true,
          business: { select: { slug: true } },
        },
      },
    },
  });
}
