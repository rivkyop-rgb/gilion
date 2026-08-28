/**
 * The people inside one business.
 *
 * `UserMembership` is tenant-scoped, so listing goes through tenantDb like
 * everything else (conventions.md §2). `User` is NOT — a person can belong to
 * more than one business — so every read of it is reached through a membership
 * that has already been scoped, never queried on its own.
 */
import bcrypt from "bcryptjs";
import { basePrisma, tenantDb } from "./db";
import type { AssignableRole } from "@/lib/domain/team";

export async function listMembers(businessId: string) {
  return tenantDb(businessId).userMembership.findMany({
    where: { role: { not: "customer" } },
    orderBy: [{ status: "asc" }, { created_at: "asc" }],
    select: {
      id: true,
      role: true,
      status: true,
      created_at: true,
      user: { select: { id: true, name: true, email: true, is_super_admin: true } },
    },
  });
}

/** The shape the domain rules need, with no Prisma types leaking into them. */
export async function memberSnapshots(businessId: string) {
  const rows = await listMembers(businessId);
  return rows.map((m) => ({
    userId: m.user.id,
    role: m.role as AssignableRole,
    active: m.status === "active",
  }));
}

export async function getMember(businessId: string, userId: string) {
  const m = await tenantDb(businessId).userMembership.findFirst({
    where: { user_id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return m;
}

export async function emailTaken(email: string) {
  const found = await basePrisma.user.findUnique({ where: { email }, select: { id: true } });
  return found !== null;
}

/**
 * Creates the person and their membership in one transaction.
 *
 * Same reason as creating a business with its admin: a user with no membership
 * lands on the "you belong to no business" dead end, and there is no screen
 * that can rescue them.
 */
export async function createMember(
  businessId: string,
  data: { name: string; email: string; password: string; role: AssignableRole },
) {
  const hash = await bcrypt.hash(data.password, 10);

  return basePrisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name.trim(),
        email: data.email,
        password_hash: hash,
        user_type: "internal",
      },
    });

    await tx.userMembership.create({
      data: { user_id: user.id, business_id: businessId, role: data.role, status: "active" },
    });

    return user;
  });
}

export async function setMemberRole(businessId: string, userId: string, role: AssignableRole) {
  const m = await getMember(businessId, userId);
  if (!m) return null;
  return basePrisma.userMembership.update({ where: { id: m.id }, data: { role } });
}

export async function setMemberStatus(
  businessId: string,
  userId: string,
  status: "active" | "inactive",
) {
  const m = await getMember(businessId, userId);
  if (!m) return null;
  return basePrisma.userMembership.update({ where: { id: m.id }, data: { status } });
}
