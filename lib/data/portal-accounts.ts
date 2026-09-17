/**
 * Portal logins, as the INTERNAL side manages them (stage 09).
 *
 * A portal account is a User with user_type = customer and one membership with
 * role = customer and customer_id set — the CHECK constraint on UserMembership
 * refuses the role without the customer. Tenant-scoped through the membership,
 * like lib/data/team.ts; the User row itself is only ever reached through one.
 */
import bcrypt from "bcryptjs";
import { basePrisma, tenantDb } from "./db";

export async function listPortalAccounts(businessId: string, customerId: string) {
  return tenantDb(businessId).userMembership.findMany({
    where: { role: "customer", customer_id: customerId },
    orderBy: { created_at: "asc" },
    select: {
      id: true,
      status: true,
      created_at: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function createPortalAccount(
  businessId: string,
  customerId: string,
  data: { name: string; email: string; password: string },
) {
  const hash = await bcrypt.hash(data.password, 10);
  // One transaction: a customer user without its membership lands on the
  // "not linked" notice and nothing on any screen can repair it.
  return basePrisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name.trim(),
        email: data.email,
        password_hash: hash,
        user_type: "customer",
      },
    });
    await tx.userMembership.create({
      data: {
        user_id: user.id,
        business_id: businessId,
        customer_id: customerId,
        role: "customer",
        status: "active",
      },
    });
    return user;
  });
}

/** Closing the door without deleting the person or their request history. */
export async function setPortalAccountStatus(
  businessId: string,
  customerId: string,
  membershipId: string,
  active: boolean,
) {
  const result = await tenantDb(businessId).userMembership.updateMany({
    where: { id: membershipId, role: "customer", customer_id: customerId },
    data: { status: active ? "active" : "inactive" },
  });
  return result.count === 1;
}

/**
 * Everything this customer's portal logins did (backlog 25), newest first.
 *
 * By the people, not by the target: a sign-in targets the customer, a request
 * the customer, an upload the advertisement, a cancellation the order — what
 * they all share is who did them.
 */
export async function portalActivity(businessId: string, customerId: string, limit = 100) {
  const logins = await tenantDb(businessId).userMembership.findMany({
    where: { role: "customer", customer_id: customerId },
    select: { user_id: true },
  });
  if (logins.length === 0) return [];
  return tenantDb(businessId).auditLog.findMany({
    where: {
      user_id: { in: logins.map((l) => l.user_id) },
      action: {
        in: [
          "portal_sign_in",
          "portal_submit_request",
          "portal_upload_ad",
          "portal_cancel_request",
        ],
      },
    },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      created_at: true,
      new_value: true,
      user: { select: { name: true, email: true } },
    },
  });
}

/**
 * Who sent a portal order, and when (backlog 27) — read off the audit row the
 * submission wrote in its own transaction, so the order screen names the
 * person rather than just "the portal".
 */
export async function portalSubmission(businessId: string, orderId: string) {
  return tenantDb(businessId).auditLog.findFirst({
    where: { action: "portal_submit_request", new_value: { path: ["orderId"], equals: orderId } },
    select: { created_at: true, user: { select: { name: true, email: true } } },
  });
}
