/**
 * The customer-side counterpart of the tenant context (FR-9, stage 09).
 *
 * Kept apart from lib/auth/portal.ts, which reads the session, so the rule
 * itself can be tested without Auth.js: a portal scope exists only for a user
 * who is a customer by BOTH user_type and membership role, and who is bound to
 * one business and one customer. Anything less is not "a customer with some
 * fields missing" — it is someone the portal must not serve at all.
 */

export type CustomerScope = {
  userId: string;
  businessId: string;
  customerId: string;
};

export class NotCustomerError extends Error {
  constructor(reason: string) {
    super(`not a portal customer: ${reason}`);
    this.name = "NotCustomerError";
  }
}

export type SessionUserLike = {
  id?: string;
  userType?: "internal" | "customer";
  role?: string;
  businessId?: string;
  customerId?: string;
};

export function customerScopeFrom(user: SessionUserLike | null | undefined): CustomerScope {
  if (!user?.id) throw new NotCustomerError("no session");
  // Both, not either (09-customer-portal.md §הרשאות). A customer user_type
  // with a staff role, or a staff user holding a customer membership, is a
  // data error — and a data error must fail closed.
  if (user.userType !== "customer") throw new NotCustomerError("user_type is not customer");
  if (user.role !== "customer") throw new NotCustomerError("role is not customer");
  if (!user.businessId) throw new NotCustomerError("no business");
  if (!user.customerId) throw new NotCustomerError("no customer");
  return { userId: user.id, businessId: user.businessId, customerId: user.customerId };
}

/** Where a signed-in user belongs, by the same two facts the portal checks. */
export function isPortalUser(user: SessionUserLike | null | undefined): boolean {
  return user?.userType === "customer" || user?.role === "customer";
}
