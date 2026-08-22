/**
 * Role-based access control (FR-8, FR-9).
 *
 * The matrix below is a direct transcription of the table in
 * docs/plan/01-auth-multitenancy.md. It is the single source of truth: the
 * sidebar, the route guards and the Vitest suite all read from it, so a role
 * can never be allowed in the menu but blocked in the server (or worse, the
 * reverse). Adding an area here forces every consumer to handle it.
 *
 * Pure module: no Prisma, no React (conventions.md §9).
 */

export const ROLES = ["admin", "sales", "designer", "accounting", "customer"] as const;
export type Role = (typeof ROLES)[number];

export const AREAS = [
  "dashboard",
  "customers",
  "orders",
  "advertisements",
  "issues",
  "pdf",
  "billing",
  "reports",
  "settings",
  "audit",
  "portal",
] as const;
export type Area = (typeof AREAS)[number];

/** none = no access at all · read = may view · write = may view and change */
export type Access = "none" | "read" | "write";

const MATRIX: Record<Area, Record<Role, Access>> = {
  dashboard: {
    admin: "write",
    sales: "write",
    designer: "write",
    accounting: "write",
    customer: "none",
  },
  customers: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "read",
    customer: "none",
  },
  orders: {
    admin: "write",
    sales: "write",
    designer: "none",
    accounting: "read",
    customer: "none",
  },
  advertisements: {
    admin: "write",
    sales: "write",
    designer: "write",
    accounting: "none",
    customer: "none",
  },
  issues: {
    admin: "write",
    sales: "read",
    designer: "write",
    accounting: "none",
    customer: "none",
  },
  pdf: { admin: "write", sales: "none", designer: "write", accounting: "none", customer: "none" },
  // FR-8: designer must not see payment data anywhere — not in the menu, not in
  // a table column, not in an API response.
  billing: {
    admin: "write",
    sales: "none",
    designer: "none",
    accounting: "write",
    customer: "none",
  },
  reports: {
    admin: "write",
    sales: "read",
    designer: "none",
    accounting: "write",
    customer: "none",
  },
  settings: {
    admin: "write",
    sales: "none",
    designer: "none",
    accounting: "none",
    customer: "none",
  },
  audit: { admin: "write", sales: "none", designer: "none", accounting: "none", customer: "none" },
  // FR-9: the customer portal is the only place a customer may reach, and no
  // internal role may reach it.
  portal: { admin: "none", sales: "none", designer: "none", accounting: "none", customer: "write" },
};

export function access(role: Role, area: Area): Access {
  return MATRIX[area][role];
}

export function canRead(role: Role, area: Area): boolean {
  return access(role, area) !== "none";
}

export function canWrite(role: Role, area: Area): boolean {
  return access(role, area) === "write";
}

/** Areas a role may see at all — what the sidebar renders. */
export function readableAreas(role: Role): Area[] {
  return AREAS.filter((a) => canRead(role, a));
}

export class ForbiddenError extends Error {
  constructor(
    readonly role: Role,
    readonly area: Area,
    readonly needed: Access,
  ) {
    super(`role "${role}" lacks ${needed} access to "${area}"`);
    this.name = "ForbiddenError";
  }
}

/** Throws unless the role has at least the required access. Server-side guard. */
export function requireAccess(role: Role, area: Area, needed: "read" | "write" = "read"): void {
  const has = access(role, area);
  if (has === "none" || (needed === "write" && has === "read")) {
    throw new ForbiddenError(role, area, needed);
  }
}
