/**
 * The people inside one business.
 *
 * `UserMembership` is tenant-scoped, so listing goes through tenantDb like
 * everything else (conventions.md §2). `User` is NOT — a person can belong to
 * more than one business — so every read of it is reached through a membership
 * that has already been scoped, never queried on its own.
 */
import bcrypt from "bcryptjs";
import { withAudit, type AuditContext } from "./audit";
import { basePrisma, tenantDb } from "./db";
import type { AssignableRole } from "@/lib/domain/team";

export async function listMembers(businessId: string) {
  return tenantDb(businessId).userMembership.findMany({
    where: { role: { not: "customer" } },
    // Newest first, and by nothing else: the list is paged, and the person who
    // was just added has to be on the screen the "add" button returns to — not
    // at the end of page three, which reads as "it did not work". Not grouped
    // by status either: removing someone's access used to move their row to
    // another page mid-action, so the result of the click was nowhere on the
    // screen it was made on.
    orderBy: [{ created_at: "desc" }],
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
 * All three writes below are audited (FR-10), under one action.
 *
 * Handing somebody the `admin` role is the most consequential thing an admin
 * does to another person, and until 23/09/2026 none of the three left a trace:
 * the business could see WHICH cells of the permission matrix had been moved
 * (`update_role_permissions`) and not who had been let in to move them.
 *
 * One action rather than three, for the same reason stage 11 settled on one:
 * they are all "the admin changed who works here", the target is always the
 * membership, and old/new already name what moved. The password is never in
 * the log — `reset_user_password` makes the same point at greater length.
 */
const MEMBERSHIP: Omit<Parameters<typeof withAudit>[1], "targetId"> = {
  action: "update_membership",
  targetType: "UserMembership",
};

/**
 * Creates the person and their membership in one transaction.
 *
 * Same reason as creating a business with its admin: a user with no membership
 * lands on the "you belong to no business" dead end, and there is no screen
 * that can rescue them.
 */
export async function createMember(
  ctx: AuditContext,
  data: { name: string; email: string; password: string; role: AssignableRole },
) {
  const hash = await bcrypt.hash(data.password, 10);

  // Addressed by email, not by id: the row does not exist yet when the target
  // is declared, and the email is the one thing about a person that is unique
  // across the system anyway.
  return withAudit(ctx, { ...MEMBERSHIP, targetType: "User", targetId: data.email }, async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name.trim(),
        email: data.email,
        password_hash: hash,
        user_type: "internal",
      },
    });

    await tx.userMembership.create({
      data: {
        user_id: user.id,
        business_id: ctx.businessId,
        role: data.role,
        status: "active",
      },
    });

    return {
      old: null,
      new: { name: user.name, email: user.email, role: data.role, status: "active" },
      result: user,
    };
  });
}

export async function setMemberRole(ctx: AuditContext, userId: string, role: AssignableRole) {
  const m = await getMember(ctx.businessId, userId);
  if (!m) return null;

  return withAudit(ctx, { ...MEMBERSHIP, targetId: m.id }, async (tx) => {
    const updated = await tx.userMembership.update({ where: { id: m.id }, data: { role } });
    return {
      old: { email: m.user.email, role: m.role },
      new: { email: m.user.email, role },
      result: updated,
    };
  });
}

export async function setMemberStatus(
  ctx: AuditContext,
  userId: string,
  status: "active" | "inactive",
) {
  const m = await getMember(ctx.businessId, userId);
  if (!m) return null;

  return withAudit(ctx, { ...MEMBERSHIP, targetId: m.id }, async (tx) => {
    const updated = await tx.userMembership.update({ where: { id: m.id }, data: { status } });
    return {
      old: { email: m.user.email, status: m.status },
      new: { email: m.user.email, status },
      result: updated,
    };
  });
}
