/**
 * The active-tenant context (FR-1, FR-2).
 *
 * Every Server Action starts here. No exceptions — conventions.md §9.
 */
import { auth } from "./config";
import type { Access, Area, Role } from "./rbac";
import { loadOverrides } from "@/lib/data/permissions";
import { effectiveAccess, type PermissionOverrides } from "@/lib/domain/permissions";
import { ForbiddenError, NotSuperAdminError } from "./rbac";

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
  /**
   * Platform owner. Inside a business they act as its admin, so `role` is
   * "admin" here too — this flag is what additionally opens the platform area
   * and what let them enter this business without a membership.
   */
  isSuperAdmin: boolean;
  /**
   * This business's deltas from the built-in matrix (FR-8). Sparse — an absent
   * cell follows the default, so a business that never changed anything
   * carries an empty object and keeps tracking the defaults as they evolve.
   */
  permissions: PermissionOverrides;
};

export async function getTenantContext(): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) throw new NotAuthenticatedError();
  if (!session.user.businessId || !session.user.role) throw new NoActiveBusinessError();

  return {
    userId: session.user.id,
    businessId: session.user.businessId,
    role: session.user.role,
    isSuperAdmin: session.user.isSuperAdmin === true,
    permissions: await loadOverrides(session.user.businessId),
    ...(session.user.customerId ? { customerId: session.user.customerId } : {}),
  };
}

/**
 * The access check every screen and action goes through.
 *
 * Takes the whole context rather than a bare role, and that is the point: the
 * effective answer now depends on the business's overrides as well as the
 * role, and a signature that accepted only a role would let a call site
 * silently keep enforcing the defaults. TypeScript refuses the old shape, so
 * no enforcement point can be left behind.
 */
export function accessFor(ctx: TenantContext, area: Area): Access {
  if (ctx.isSuperAdmin && area !== "platform") return "write";
  return effectiveAccess(ctx.role, area, ctx.permissions);
}

export function canReadArea(ctx: TenantContext, area: Area): boolean {
  return accessFor(ctx, area) !== "none";
}

export function canWriteArea(ctx: TenantContext, area: Area): boolean {
  return accessFor(ctx, area) === "write";
}

/** Throws unless the context has at least the required access. */
export function requireArea(
  ctx: TenantContext,
  area: Area,
  needed: "read" | "write" = "read",
): void {
  if (area === "platform") {
    if (!ctx.isSuperAdmin) throw new NotSuperAdminError();
    return;
  }
  const has = accessFor(ctx, area);
  if (has === "none" || (needed === "write" && has === "read")) {
    throw new ForbiddenError(ctx.role, area, needed);
  }
}
