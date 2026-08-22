/**
 * The active-tenant context (FR-1, FR-2).
 *
 * Every Server Action starts here. No exceptions — conventions.md §9.
 */
import { auth } from "./config";
import type { Role } from "./rbac";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("no session");
    this.name = "NotAuthenticatedError";
  }
}

export class NoActiveBusinessError extends Error {
  constructor() {
    super("no active business on the session");
    this.name = "NoActiveBusinessError";
  }
}

export type TenantContext = {
  userId: string;
  businessId: string;
  role: Role;
  /** Set only for role = customer (FR-9). */
  customerId?: string;
};

export async function getTenantContext(): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) throw new NotAuthenticatedError();
  if (!session.user.businessId || !session.user.role) throw new NoActiveBusinessError();

  return {
    userId: session.user.id,
    businessId: session.user.businessId,
    role: session.user.role,
    ...(session.user.customerId ? { customerId: session.user.customerId } : {}),
  };
}
