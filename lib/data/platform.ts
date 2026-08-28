/**
 * Platform-level data access — the one module that is NOT tenant-scoped.
 *
 * Everything else in lib/data goes through tenantDb (conventions.md §2). This
 * one cannot: it creates businesses, and a business cannot be scoped to itself.
 * That is exactly why every function here is unreachable without
 * requireSuperAdmin() at the action boundary.
 */
import bcrypt from "bcryptjs";
import { basePrisma } from "./db";

export async function listBusinesses() {
  return basePrisma.business.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      created_at: true,
      _count: { select: { memberships: true, newspapers: true, customers: true } },
    },
  });
}

export async function businessNameTaken(name: string) {
  const found = await basePrisma.business.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  return found !== null;
}

export async function emailTaken(email: string) {
  const found = await basePrisma.user.findUnique({ where: { email }, select: { id: true } });
  return found !== null;
}

export type NewBusiness = {
  businessName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

/**
 * Creates the business and its first admin in ONE transaction.
 *
 * Separately, either half can succeed alone: a business with no admin is a
 * tenant nobody can open, and a user with no membership lands on the
 * "you belong to no business" dead end. Neither is recoverable from the UI,
 * so they commit together or not at all.
 */
export async function createBusinessWithAdmin(data: NewBusiness) {
  const hash = await bcrypt.hash(data.adminPassword, 10);

  return basePrisma.$transaction(async (tx) => {
    const business = await tx.business.create({ data: { name: data.businessName.trim() } });

    const user = await tx.user.create({
      data: {
        name: data.adminName.trim(),
        email: data.adminEmail,
        password_hash: hash,
        user_type: "internal",
      },
    });

    await tx.userMembership.create({
      data: {
        user_id: user.id,
        business_id: business.id,
        role: "admin",
        status: "active",
      },
    });

    return { business, user };
  });
}
